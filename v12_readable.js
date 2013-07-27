function EmulatorCoreModule(stdlib) {

// Registers
var d0 = 0; // data registers, treat as 32 bit ints
var d1 = 0;
var d2 = 0;
var d3 = 0;
var d4 = 0;
var d5 = 0;
var d6 = 0;
var d7 = 0;
var a0 = 0; // address registers, treat as 32 bit ints (A8 = the currently unused address register, i.e. sp / ssp)
var a1 = 0;
var a2 = 0;
var a3 = 0;
var a4 = 0;
var a5 = 0;
var a6 = 0;
var a7 = 0;
var a8 = 0;
var sr = 0; // status register, treat as 16 bit int
var pc = 0; // program counter, treat as 32 bit int

// Emulator arrays (rom usually redefined elsewhere).
var rom = new Uint16Array(0x200000);
var ram = new Uint16Array(131072); // 256K of RAM, treat as array of words
//var ramflag = new Array(131072);
var t = new Array(65536); // Instruction handlers.
var n = new Array(65536); // Instruction names.
var link_incoming_queue = new Array();
var link_outgoing_queue = new Array();

// Emulator variables, part 1.
var unhandled_count = 0; // number of unhandled instructions encountered
var interval = 0; // interval ID of main timer
var tracecount = 20; // number of instructions to trace in console
var overall = 2500;
var osc2_counter = 0;
var frames_counted = 0;
var total_time = 0;
var newromready = false;
var newfileready = false;
var newflashfileready = false;
var ui = false;

var link_recv_varsize = 0;
var link_recv_vartype = 0;
var link_recv_varname = "";
var link_recv_foldername = "";
var link_recv_filedata = new Array();

// Hardware ports and variables deduced from them.
var port_600000 = 0x04;
var vectorprotect = false; // 0x600001
var wakemask = 0; // 0x600005
var link_config = 1; // 0x60000C
var transmit_finished = false; // deduced from 0x60000C
var lcd_address_high = 9; // 0x600010: stores LCD address / 8, corresponding to the default 0x4c00
var lcd_address_low = 0x80; // 0x600011
var screen_height = 128; // 0x600013
var interrupt_control = 0x1B; // 0x600015
var interrupt_rate = 0x200; // deduced from 0x600015
var timer_min = 0xB2; // 0x600017; 0xCC on HW2
var timer_current = 0; // 0x600017
var keystatus = new Uint8Array(80); // status of each key is at ROW * 8 + COLUMN
var keymaskhigh = 0xFF; // 0x600018
var keymasklow = 0xFF; // 0x600019: which key rows are selected to read
var port_60001A = 0x02; // 0x60001A: ON key not pressed
var port_60001D = 0; // 0x60001D
var port_70001D = 0; // 0x70001D
var port_70001F = 0; // 0x70001F

// Emulator variables, part 2.
var stopped = false;
var hardware_model = 1; // Only HW1 is emulated at the moment anyway.
var calculator_model = 1;
var pedrom = false;
var punix = false;
var jmp_tbl = 0;
var ROM_base; // Deduced from calculator model
var FlashMemorySize;
var Protection_enabled = false; // The Protection with a capital P is not implemented, it slows down emulation.
var hex_prefix = "$";

// Flash memory state machine
var flash_write_ready = 0;
var flash_write_phase = 0x50;
var flash_ret_or = 0;

function to_hex(number, digits)
{
	var s = "";
	if (number < 0)
	{
		number = -number;
		digits--;
		s = "-";
	}

	var c = "0123456789ABCDEF";
	while (digits--)
	{
		var digit = number % 16;
		number = (number - digit) / 16;
		s = c[digit] + s;
	}
	return s;
}

function to_hex2(number, digits)
{
	var s = "";
	var c = "0123456789ABCDEF";
	while (digits--)
	{
		var digit = number & 15;
		number = number >> 4;
		s = c[digit] + s;
	}
	return s;
}

function memory_dump(address, size, stride)
{
	var i = 0;
	var end = address + size;
	address &= 0xFFFFFF;
	var str = to_hex(address, 6) + "\t";
	while (address < end)
	{
		if (i == stride) {
			str += "\n" + to_hex(address, 6) + "\t";
			i = 0;
		}
		str += to_hex(rb(address), 2) + " ";
		address++;
		i++;
	}
	console.log(str);
}

function ROM_CALL(id)
{
	return rl(jmp_tbl + 4 * id);
}

// Special-casing for PedroM extracted from TIEmu, src/core/ti_sw/handles.c.
function HeapTable()
{
	// Are we dealing with an old version of PedroM ?
	if (pedrom && ram[0x30 >>> 1] <= 0x0080) {
		return rl(0x5d58);
	}
	else {
		if (ROM_CALL(-1) < 0x441 && !pedrom) { // TIOS_entries.
			// AMS 1.xx
			return rl(rw(ROM_CALL(0x96) + 8)); // Use word at HeapDeref + 8.
		}
		else {
			// AMS 2.xx, 3.xx, PedroM >= 0.81 (which still pretends to have fewer entries in the jump table than AMS 2.xx and 3.xx have).
			return ROM_CALL(0x441); // HeapTable.
		}
	}
}

function HeapDeref(id)
{
	return rl(HeapTable() + 4 * id);
}

// Special-casing for PedroM extracted from TIEmu, src/core/ti_sw/handles.c.
function HeapSizeAddress(address)
{
	if (!pedrom) { // AMS
		// Read 2 bytes before addess, remove locked indication, subtract 1 byte, and multiply by 2.
		return ((rw(address - 2) & 0x7FFF) - 1) << 1;
	}
	else {
		if (address >= ROM_base) { // archived file: use file size
			return rw(address) + 2;
		}
		else {
			return rl(address - 6) - 6;
		}
	}
}

function HeapSize(id)
{
	return HeapSizeAddress(rl(HeapTable() + 4 * id));
}
// TODO: Ptr2Hd ?

function PrintHeap()
{
	// 0 is an invalid HANDLE.
	var address = HeapTable() + 4;
	console.log("0\tFFFFFF\tN/A");
	for (var i = 1; i < 2000; i++) {
		var handle = rl(address);
		if (handle != 0) {
			console.log(i + "\t" + to_hex(handle, 6) + "\t" + to_hex(HeapSizeAddress(handle), 6));
		}
		address += 4;
	}
}

function disassemble_indexed_disp(disp)
{
	return ((disp & 0x8000) ? "A" : "D") + (((disp & 0x7000) >>> 12) & 0x7) + ((((disp & 0x0800) >>> 11) & 1) ? ".L" : ".W") + ")";
}

function disassemble_regs_mask(regs8, prefix)
{
	var str = "";
	var previous = 0;
	var current;
	var start = -1;
	var end = -1;

	for (i = 0; i < 8; i++) {
		current = regs8 & 1;

		if (previous == 0 && current == 1) start = i;
		if (previous == 1 && current == 0) end = i - 1;

		if (start == end && start != -1) {
			str += prefix + (i - 1) + "/";
			end = -1; start = -1;
		}
		else if (end > start) {
			str += prefix + start + "-" + prefix + end + "/";
			end = -1; start = -1;
		}

		previous = current;
		regs8 >>>= 1;
	}

	end = i - 1;
	if (end > (start + 1) && start != -1) {
		str += prefix + start + "-" + end;
	}
	else if (start > 0 && end > 0) {
		str += prefix + start;
	}
	else {
		str = str.substring(0, str.length-1);
	}

	return str;
}

function disassemble_regs_predec_mask(regs8, prefix)
{
	var str = "";
	var previous = 0;
	var current;
	var start = -1;
	var end = -1;

	for (i = 0; i < 8; i++) {
		current = (regs8 & (1 << 7)) >> 7;

		if (previous == 0 && current == 1) start = i;
		if (previous == 1 && current == 0) end = i - 1;

		if (start == end && start != -1) {
			str += prefix + (i - 1) + "/";
			end = -1; start = -1;
		}
		else if (end > start) {
			str += prefix + start + "-" + prefix + end + "/";
			end = -1; start = -1;
		}

		previous = current;
		regs8 <<= 1;
	}

	end = i - 1;
	if (end > (start + 1) && start != -1) {
		str += prefix + start + "-" + end;
	}
	else if (start > 0 && end > 0) {
		str += prefix + start;
	}
	else {
		str = str.substring(0, str.length-1);
	}

	return str;
}
 
// Data areas, such as 440000 on AMS 2.09 92+, are excellent mine fields :)
// TIEmu's disassembler is not perfect either, e.g. it disassembles:
// * CHK.L instructions, which exist only on 68020+ (at 440098 and 4401BC);
// * address register indexed with base displacement, which exist only on CPU32+ (at 440110 and 4401BE);
// * ORI.B #byte, CCR as ORI.B #word,SR (at 44017A).
//
// NOTE: this emulator handles address register / PC indexed with scale / base displacement / outer displacement as if there were none of those.
// At least for scale, that's what a 68000 is supposed to do, according to M68000PRM, page 2-21. It's less clear for bd / od (no mention on pages 2-22 and later).
// For the format of the second word in such instructions, see M68000PRM, page 2-2.
function disassemble(address, count)
{
	while (count > 0) {
		var opcode = rw(address);
		var rawinstr = n[opcode];
		var orig_address = address;
		var leftside;
		var rightside;
		var idx = rawinstr.indexOf(",");
//console.log("rawinstr:\t" + rawinstr);
		if (idx == -1) { // Single-operand instruction
			leftside = rawinstr;
			rightside = "";
		}
		else {
			leftside = rawinstr.substr(0, idx);
			rightside = rawinstr.substr(idx + 1);
		}
//console.log("leftside:\t" + leftside);
//console.log("rightside:\t" + rightside);
		address += 2;
		if (leftside != "") {
			if (leftside.indexOf("#xxxxxx") != -1) { // Immediate long value
				leftside = leftside.replace("#xxxxxx", "#" + hex_prefix + to_hex(rl(address), 8));
				address += 4;
			}
			else if (leftside.indexOf("#xxx") != -1) { // Immediate short value
				leftside = leftside.replace("#xxx", "#" + hex_prefix + to_hex(rw(address), 4));
				address += 2;
			}
			else if (leftside.indexOf("#xx") != -1) { // Immediate byte value
				leftside = leftside.replace("#xx", "#" + hex_prefix + to_hex(rw(address) & 0xFF, 2));
				address += 2;
			}
			else if (leftside.indexOf("xxx.W") != -1) { // Immediate short address
				leftside = leftside.replace("xxx.W", hex_prefix + to_hex(rw(address), 4) + ".W");
				address += 2;
			}
			else if (leftside.indexOf("xxx.L") != -1) { // Immediate long address
				leftside = leftside.replace("xxx.L", hex_prefix + to_hex(rl(address), 8) + ".L");
				address += 4;
			}
			else if (leftside.indexOf("d(A") != -1) { // address register with displacement
				var disp = rw(address);
				if (rightside.indexOf("Dn)") == 0) { // address register with displacement and index
					leftside = leftside.replace("d(A", hex_prefix + to_hex(disp & 0xFF, 2) + "(A");
					leftside += "," + disassemble_indexed_disp(disp); // Adjust left side
					rightside = rightside.substring(4); // Skip Dn),
				}
				else { 
					leftside = leftside.replace("d(A", hex_prefix + to_hex(disp, 4) + "(A");
				}
				address += 2;
			}
			else if (leftside.indexOf("d(PC") != -1) { // PC with displacement
				var disp = rw(address);
				if (rightside.indexOf("Dn)") == 0) { // PC with displacement and index
					leftside = leftside.replace("d(PC", hex_prefix + to_hex(disp & 0xFF, 2) + "(PC");
					leftside += "," + disassemble_indexed_disp(disp); // Adjust left side
					rightside = rightside.substring(4); // Skip Dn),
				}
				else {
					leftside = leftside.replace("d(PC", hex_prefix + to_hex(disp, 4) + "(PC");
				}
				address += 2;
			}
			else if (leftside.indexOf(".W disp") != -1) { // Branch word displacement
				var disp = rw(address) + 2;
				if (disp & 0x8000) {
					disp = 0x10000 - disp;
					leftside = leftside.replace("disp", "-" + hex_prefix + to_hex(disp, 4) + " [" + to_hex(orig_address - disp, 6) + "]");
				}
				else {
					leftside = leftside.replace("disp", "+" + hex_prefix + to_hex(disp, 4) + " [" + to_hex(orig_address + disp, 6) + "]");
				}
				address += 2;
			}
			else if (leftside.indexOf(".S disp") != -1) { // Branch short displacement
				var disp = (opcode & 0xFF) + 2;
				if (disp & 0x80) {
					disp = 0x100 - disp;
					leftside = leftside.replace("disp", "-" + hex_prefix + to_hex(disp, 2) + " [" + to_hex(orig_address - disp, 6) + "]");
				}
				else {
					leftside = leftside.replace("disp", "+" + hex_prefix + to_hex(disp, 2) + " [" + to_hex(orig_address + disp, 6) + "]");
				}
			}
			else if (leftside.indexOf("regspredec") != -1) { // Registers for movem from regs to memory, predecremented write
				// a7 is least significant bit.
				var regsan = rb(address + 1);
				var regsdn = rb(address);
				var str = "";
				if (regsdn != 0) {
					str = disassemble_regs_predec_mask(regsdn, "D");
					str += "/";
				}
				if (regsan != 0) {
					str += disassemble_regs_predec_mask(regsan, "A");
				}
				leftside = leftside.replace("regspredec", str);
				address += 2;
			}
			else if (leftside.indexOf("regs") != -1) { // Registers for movem from regs to memory, normal write
				// d0 is least significant bit.
				var regsdn = rb(address + 1);
				var regsan = rb(address);
				var str = "";
				if (regsdn != 0) {
					str = disassemble_regs_mask(regsdn, "D");
					str += "/";
				}
				if (regsan != 0) {
					str += disassemble_regs_mask(regsan, "A");
				}
				leftside = leftside.replace("regs", str);
				address += 2;
			}
		}

		if (rightside != "") {
			// Immediate values usually forbidden as dest ea, except for LINK
			if (rightside.indexOf("#xxx") != -1) { // Immediate short value
				rightside = rightside.replace("#xxx", "#" + hex_prefix + to_hex(rw(address), 4));
				address += 2;
			}
			else if (rightside.indexOf("xxx.W") != -1) { // Immediate short address
				rightside = rightside.replace("xxx.W", hex_prefix + to_hex(rw(address), 4) + ".W");
				address += 2;
			}
			else if (rightside.indexOf("xxx.L") != -1) { // Immediate long address
				rightside = rightside.replace("xxx.L", hex_prefix + to_hex(rl(address), 8) + ".L");
				address += 4;
			}
			else if (rightside.indexOf("d(A") != -1) { // address register with displacement
				//console.log(leftside);
				//console.log(rightside);
				var disp = rw(address);
				if (rightside.indexOf(",Dn)") != -1) { // address register with displacement and index
					rightside = rightside.replace("d(A", hex_prefix + to_hex(disp & 0xFF, 2) + "(A");
					rightside = rightside.replace("Dn)", disassemble_indexed_disp(disp));
				}
				else {
					rightside = rightside.replace("d(A", hex_prefix + to_hex(disp, 4) + "(A");
				}
				address += 2;
			}
			// PC with displacement is forbidden as dest ea (sadly, as it would be great for PC-relative / PIC programs...)
			else if (rightside.indexOf("disp") != -1) { // Branch short displacement for DBcc
				var disp = rw(address) + 2;
				if (disp & 0x8000) {
					disp = 0x10000 - disp;
					rightside = rightside.replace("disp", "-" + hex_prefix + to_hex(disp, 4) + " [" + to_hex(orig_address - disp, 6) + "]");
				}
				else {
					rightside = rightside.replace("disp", "+" + hex_prefix + to_hex(disp, 4) + " [" + to_hex(orig_address + disp, 6) + "]");
				}
				address += 2;
			}
			else if (rightside.indexOf("regs") != -1)  { // Registers for movem from memory to regs
				// d0 is least significant bit.
				var regsdn = rb(address + 1);
				var regsan = rb(address);
				var str = "";
				if (regsdn != 0) {
					str = disassemble_regs_mask(regsdn, "D");
					str += "/";
				}
				if (regsan != 0) {
					str += disassemble_regs_mask(regsan, "A");
				}
				rightside = rightside.replace("regs", str);
				address += 2;
			}

			console.log(to_hex(orig_address, 6) + "\t" + leftside + "," + rightside);
		}
		else {
			console.log(to_hex(orig_address, 6) + "\t" + leftside);
		}
		count--;
	}
}

// returns the executor for an unimplemented instruction
function make_unhandled(i)
{
	return function() { 
		console.log("Unhandled instruction " + to_hex(i, 4) + " at address " + to_hex(pc - 2, 8));
		unhandled_count++;
	};
};

// brief display of the system status
function print_status()
{
	console.log("---")
	var opcode = rw(pc);
	console.log("PC=" + to_hex(pc, 9) + " SR=" + to_hex(sr, 4) + " opcode=" + to_hex(opcode, 4) + " " + n[opcode]);
	var a = "";
	var d = "";
	for (var r = 0; r < 8; r++)
	{
		a += "A" + r + "=" + to_hex(eval("a" + r), 9) + " ";
		d += "D" + r + "=" + to_hex(eval("d" + r), 9) + " ";
	}
	console.log(d);
	console.log(a);
}

function print_status2()
{
	console.log("---")
	var opcode = rw(pc);
	for (var r = 0; r < 8; r++)
	{
		console.log("D" + r + "=" + to_hex(eval("d" + r), 9) + "\t" + "A" + r + "=" + to_hex(eval("a" + r), 9));
	}
	console.log("SR=" + to_hex(sr, 4) + "\tPC=" + to_hex(pc, 9));
	console.log("T=" + ((sr & 0x8000) >>> 15) + "\tS=" + ((sr & 0x2000) >>> 13) + "\tM=" + ((sr & 0x1000) >>> 12) + "\tI=" + ((sr & 0x0700) >>> 8));
	console.log("X=" + ((sr & 0x0010) >>>  4) + "\tN=" + ((sr & 0x0008) >>>  3) + "\tZ=" + ((sr & 0x0004) >>>  2) + "\tV=" + ((sr & 0x0002) >>> 1) + "\tC=" + (sr & 0x0001));
	console.log("opcode=" + to_hex(opcode, 4) + "\t" + n[opcode]);
}

// sign extend functions

function ebw(value)
{
	value = value & 0xFF;
	return (value <= 0x7F) ? value : 0xFF00 + value;
}

function ewl(value)
{
	value = value & 0xFFFF;
	return (value <= 0x7FFF) ? value : 0xFFFF0000 + value;
}

// Functions to perform addition and subtraction and update the condition codes

function subw(subtrahend, minuend)
{
	subtrahend &= 0xFFFF;
	minuend &= 0xFFFF;
	var complement = 0x10000 - subtrahend;
	var result = complement + minuend;
	var maskedresult = result >= 0x10000 ? result - 0x10000 : result;
	sr = sr & 0xFFE0;
	if (maskedresult == 0) sr += 4; // zero flag
	if (result & 0x8000) sr += 8; // negative flag
	if (maskedresult < 0) maskedresult += 0x100000000;
	if (complement < 0x8000 && minuend < 0x8000 && maskedresult >= 0x8000) sr += 2; // overflow flag
	if (complement >= 0x8000 && minuend >= 0x8000 && maskedresult < 0x8000) sr += 2; // overflow flag
	if (subtrahend > minuend) sr += 0x11; // carry and overflow
	return maskedresult;
}

function cmpw(subtrahend, minuend)
{
	subtrahend &= 0xFFFF;
	minuend &= 0xFFFF;
	var complement = 0x10000 - subtrahend;
	var result = complement + minuend;
	var maskedresult = result >= 0x10000 ? result - 0x10000 : result;
	sr = sr & 0xFFF0;
	if (maskedresult == 0) sr += 4; // zero flag
	if (result & 0x8000) sr += 8; // negative flag
	if (maskedresult < 0) maskedresult += 0x100000000;
	if (complement < 0x8000 && minuend < 0x8000 && maskedresult >= 0x8000) sr += 2; // overflow flag
	if (complement >= 0x8000 && minuend >= 0x8000 && maskedresult < 0x8000) sr += 2; // overflow flag
	if (subtrahend > minuend) sr += 1; // carry and overflow
	return maskedresult;
}

function addw(x, y)
{
	x &= 0xFFFF;
	y &= 0xFFFF;
	var result = x + y;
	var maskedresult = result & 0xFFFF;
	sr = sr & 0xFFE0;
	if (maskedresult == 0) sr += 4; // zero flag
	if (result & 0x8000) sr += 8; // negative flag
	if (result != maskedresult) sr += 0x11; // carry and overflow
	if (y < 0x8000 && x < 0x8000 && maskedresult >= 0x8000) sr += 2; // overflow flag
	if (y >= 0x8000 && x >= 0x8000 && maskedresult < 0x8000) sr += 2; // overflow flag
	return maskedresult;
}

function subb(subtrahend, minuend)
{
	subtrahend &= 0xFF;
	minuend &= 0xFF;
	var complement = 0x100 - subtrahend;
	var result = complement + minuend;
	var maskedresult = result >= 0x100 ? result - 0x100 : result;
	sr = sr & 0xFFE0;
	if (maskedresult == 0) sr += 4; // zero flag
	if (result & 0x80) sr += 8; // negative flag
	if (maskedresult < 0) maskedresult += 0x100000000;
	if (complement < 0x80 && minuend < 0x80 && maskedresult >= 0x80) sr += 2; // overflow flag
	if (complement >= 0x80 && minuend >= 0x80 && maskedresult < 0x80) sr += 2; // overflow flag
	if (subtrahend > minuend) sr += 0x11; // carry and overflow
	return maskedresult;
}

function cmpb(subtrahend, minuend)
{
	subtrahend &= 0xFF;
	minuend &= 0xFF;
	var complement = 0x100 - subtrahend;
	var result = complement + minuend;
	var maskedresult = result >= 0x100 ? result - 0x100 : result;
	sr = sr & 0xFFF0;
	if (maskedresult == 0) sr += 4; // zero flag
	if (result & 0x80) sr += 8; // negative flag
	if (maskedresult < 0) maskedresult += 0x100000000;
	if (complement < 0x80 && minuend < 0x80 && maskedresult >= 0x80) sr += 2; // overflow flag
	if (complement >= 0x80 && minuend >= 0x80 && maskedresult < 0x80) sr += 2; // overflow flag
	if (subtrahend > minuend) sr += 1; // carry and overflow
	return maskedresult;
}

function addb(x, y)
{
	x &= 0xFF;
	y &= 0xFF;
	var result = x + y;
	var maskedresult = result & 0xFF;
	sr = sr & 0xFFE0;
	if (maskedresult == 0) sr += 4; // zero flag
	if (result & 0x80) sr += 8; // negative flag
	if (result != maskedresult) sr += 0x11; // carry and overflow
	if (y < 0x80 && x < 0x80 && maskedresult >= 0x80) sr += 2; // overflow flag
	if (y >= 0x80 && x >= 0x80 && maskedresult < 0x80) sr += 2; // overflow flag
	return maskedresult;
}

function subl(subtrahend, minuend)
{
	var complement = 0x100000000 - subtrahend;
	var result = complement + minuend;
	var maskedresult = result >= 0x100000000 ? result - 0x100000000 : result;
	sr = sr & 0xFFE0;
	if (maskedresult == 0) sr += 4; // zero flag
	if (result & 0x80000000) sr += 8; // negative flag
	if (maskedresult < 0) maskedresult += 0x100000000;
	if (complement < 0x80000000 && minuend < 0x80000000 && maskedresult >= 0x80000000) sr += 2; // overflow flag
	if (complement >= 0x80000000 && minuend >= 0x80000000 && maskedresult < 0x80000000) sr += 2; // overflow flag
	if (subtrahend > minuend) sr += 0x11; // carry and overflow
	return maskedresult;
}

function cmpl(subtrahend, minuend)
{
	var complement = 0x100000000 - subtrahend;
	var result = complement + minuend;
	var maskedresult = result >= 0x100000000 ? result - 0x100000000 : result;
	sr = sr & 0xFFF0;
	if (maskedresult == 0) sr += 4; // zero flag
	if (result & 0x80000000) sr += 8; // negative flag
	if (maskedresult < 0) maskedresult += 0x100000000;
	if (complement < 0x80000000 && minuend < 0x80000000 && maskedresult >= 0x80000000) sr += 2; // overflow flag
	if (complement >= 0x80000000 && minuend >= 0x80000000 && maskedresult < 0x80000000) sr += 2; // overflow flag
	if (subtrahend > minuend) sr += 1; // carry and overflow
	return maskedresult;
}

function addl(x, y)
{
	var result = x + y;
	var maskedresult = result >= 0x100000000 ? result - 0x100000000 : result;
	sr = sr & 0xFFE0;
	if (maskedresult == 0) sr += 4; // zero flag
	if (result & 0x80000000) sr += 8; // negative flag
	if (result != maskedresult) sr += 0x11; // carry and overflow
	if (maskedresult < 0) maskedresult += 0x100000000;
	if (x < 0x80000000 && y < 0x80000000 && maskedresult >= 0x80000000) sr += 2; // overflow flag
	if (x >= 0x80000000 && y >= 0x80000000 && maskedresult < 0x80000000) sr += 2; // overflow flag
	return maskedresult;
}

function abcd(x,y)
{
	var lowsum = (x & 0xF) + (y & 0xF);
	if (sr & 0x10) lowsum++; // carry in from the x register

	var carrymid = 0;
	if (lowsum >= 10) {
		lowsum -= 10;
		carrymid = 0x10;
	}

	var highsum = (x & 0xF0) + (y & 0xF0) + carrymid;
	sr &= 0xFFE4;
	if (highsum >= 0xA0) {
		highsum -= 0xA0;
		sr |= 0x11; // carry out into both X and C
	}
	var result = highsum + lowsum;
	if (result != 0) sr &= 0xFFFB; // zero flag
	return result;
}

function sbcd(dst,src)
{
	src &= 0xFF;
	dst &= 0xFF;
	var subtrahend = (src >>> 4) * 10 + (src & 0xF);
	var minuend = (dst >>> 4) * 10 + (dst & 0xF);
	var result = minuend - subtrahend;
	if (sr & 1) result--; // borrow from previous subtraction
	sr &= 0xFFE4; // clear all condition codes but Z
	if (result < 0) {
		result = result + 100;
		sr |= 0x11; // set carry and extend if we had a borrow;
	}
	if (finalresult != 0) sr &= 0xFFFB; // clear zero flag
	var lowdigit = result % 10;
	var highdigit = (result - lowdigit) / 10;
	var finalresult = highdigit * 16 + lowdigit;
	return finalresult;
}

function nbcd(src)
{
	src &= 0xFF;
	var subtrahend = (src >>> 4) * 10 + (src & 0xF);
	var result = 0 - subtrahend;
	if (sr & 1) result--; // borrow from previous subtraction
	sr &= 0xFFE4; // clear all condition codes but Z
	if (result < 0) {
		result = result + 100;
		sr |= 0x11; // set carry and extend if we had a borrow;
	}
	if (finalresult != 0) sr &= 0xFFFB; // clear zero flag
	var lowdigit = result % 10;
	var highdigit = (result - lowdigit) / 10;
	var finalresult = highdigit * 16 + lowdigit;
	return finalresult;
}

function addx(x,y,size)
{
	var overflow = 0x100;
	if (size==1) overflow = 0x10000;
	if (size==2) overflow = 0x100000000;
	var neg = overflow / 2;
	var result = x + y;
	if (sr & 0x10) result++; // carry in from X bit
	sr &= 0xFFE4; // clear condition flags but Z
	if (result >= overflow)
	{
		result -= overflow;
		sr |= 0x11; // set X and C on carry out
	}
	if (result != 0) sr &= 0xFFBF; // clear zero flag
	if (result + result >= overflow) sr |= 8; // set negative flag
	if (x >= neg && y >= neg && result < neg) sr |= 2; // set overflow flag
	if (x < neg && y < neg && result >= neg) sr |= 2;
	return result;
}

function subx(x,y,size)
{
	var overflow = 0x100;
	if (size==1) overflow = 0x10000;
	if (size==2) overflow = 0x100000000;
	var neg = overflow / 2;
	var result = y - x;
	if (sr & 0x10) result--; // carry in from X bit
	sr &= 0xFFE4; // clear condition flags but Z
	if (result < 0)
	{
		result += overflow;
		sr |= 0x11; // set X and C on carry out
	}
	if (result != 0) sr &= 0xFFBF; // clear zero flag
	if (result + result >= overflow) sr |= 8; // set negative flag
	if (x >= neg && y < neg && result >= neg) sr |= 2; // set overflow flag (positive minus negative giving negative)
	if (x < neg && y >= neg && result < neg) sr |= 2; // set overflow flag (negative minus positive giving positive)
	return result;
}

// Multiplication and division

function muls(x, y)
{
	x = x & 0xFFFF;
	y = y & 0xFFFF;
	if (x >= 0x8000) x -= 0x10000;
	if (y >= 0x8000) y -= 0x10000;
	var product = x * y;
	sr &= 0xFFF0; // clear all user flags but X
	if (product < 0) {
		product += 0x100000000;
		sr |= 8; // negative flag
	}
	if (product == 0) sr |= 4; // zero flag
	return product;
}

function mulu(x, y)
{
	x = x & 0xFFFF;
	y = y & 0xFFFF;
	var product = x * y;
	sr &= 0xFFF0; // clear all user flags but X
	product &= 0xFFFFFFFF;
	if (product >= 0x80000000) sr |= 8; // negative flag
	if (product == 0) sr |= 4; // zero flag
	return product;
}

function divu(divisor, dividend)
{
	if (divisor == 0) fire_cpu_exception(5); // Divide by zero
	// XXX this one needs to be enabled, but currently, if we do, divu(0xCCCCFFFF, 0xFF000000) returns something stupid.
	//dividend &= 0xFFFFFFFF;
	divisor &= 0xFFFF;
	var quotient = Math.floor(dividend / divisor) & 0xFFFFFFFF;
	var remainder = (dividend % divisor) & 0xFFFF;
	sr &= 0xFFF0; // clear all user flags but X
	if (quotient == 0) sr |= 4; // zero flag
	
	if (quotient & 0xFFFF0000) {
		// NOTE: M68000PRM indicates "N undefined when V".
		if (quotient >= 0x80000000) sr |= 8; // negative
		sr |= 2; // overflow
		return dividend;
	}
	if (quotient > 0x10000 || remainder > 0x10000 || quotient < 0 || remainder < 0) console.log("bad divide!");
	var result = quotient | (remainder << 16);
	if (result & 0x8000) sr |= 8; // negative flag
	result &= 0xFFFFFFFF;
	return result;
}

function divs(divisor, dividend)
{
	//console.log("signed divide " + to_hex(dividend,8) + " by " + to_hex(divisor,8));

	if (divisor == 0) fire_cpu_exception(5); // Divide by zero
	
	var adivisor = divisor >= 0x8000 ? divisor - 0x10000 : divisor;
	var adividend = dividend >= 0x80000000 ? dividend - 0x100000000 : dividend;
	
	var quotient = Math.floor(adividend / adivisor);
	var remainder = adividend % adivisor;
	
	//console.log("decimal results : " + adividend + " divided by " + adivisor + " = " + quotient + " remainder " + remainder);
	
	sr &= 0xFFF0; // clear all user flags but X
	if (quotient >= 0x80000000) sr |= 8; // negative flag
	if (quotient == 0) sr |= 4; // zero flag
	
	if (quotient >= 0x8000 || quotient < -32768) {
		if (quotient >= 0x80000000) sr |= 8; // negative
		sr |= 2; // overflow
		return dividend;
	}
	
	if (quotient < 0) quotient += 0x10000;
	if (remainder < 0) remainder += 0x10000;
	
	//console.log("final result is " + to_hex(quotient + (remainder * 65536), 8));
	
	return quotient + (remainder * 65536);
}

// Functions to perform shifts and set the condition codes

// note - some of these should leave condition flags alone if shift count is 0

function lsl(x, shift, size)
{
	//if (shift == 0) console.log ("LSL 0 at " + to_hex(pc, 6));

	var overflow = 0x100;
	if (size == 1) overflow = 0x10000;
	if (size == 2) overflow = 0x100000000;
	sr &= 0xFFE0; // initially clear all user condition flags
	while (shift--)
	{
		x = x + x;
		if (x >= overflow) {
			x -= overflow;
			if (shift == 0) sr |= 0x11; // set carry and extend if last bit shifted out is 1
		}
	}
	if (x + x >= overflow) sr |= 8 // negative flag
	if (x == 0) sr |= 4; // zero flag
	return x;
}

function asl(x, shift, size)
{
	//if (shift == 0) console.log ("ASL 0 at " + to_hex(pc, 6));

	var overflow = 0x100;
	if (size == 1) overflow = 0x10000;
	if (size == 2) overflow = 0x100000000;
	sr &= 0xFFE1; // initially clear all user condition flags but carry
	if (shift > 0) sr &= 0xFFE0; // clear carry if nonzero shift
	while (shift--)
	{
		var old = x;
		x = x + x;
		if (x >= overflow) {
			x -= overflow;
			if (shift == 0) sr |= 0x11; // set carry and extend if last bit shifted out is 1
		}
		if ((x & (overflow / 2)) != (old & (overflow / 2))) sr |= 2; // set overflow flag if high bit changed
	}
	if (x + x >= overflow) sr |= 8 // negative flag
	if (x == 0) sr |= 4; // zero flag
	return x;
}

function lsr(x, shift, size)
{
	//if (shift == 0) console.log ("LSR 0 at " + to_hex(pc, 6));
	
	var overflow = 0x100;
	if (size == 1) overflow = 0x10000;
	if (size == 2) overflow = 0x100000000;
	sr &= 0xFFE0; // initially clear all user condition flags
	while (shift--)
	{
		if ((shift == 0) && (x & 1)) sr |= 0x11; // set carry and extend if last bit shifted out is 1
		x >>>= 1;
	}
	if (x + x >= overflow) sr |= 8 // negative flag
	if (x == 0) sr |= 4; // zero flag
	return x;
}

function asr(x, shift, size)
{
	//if (shift == 0) console.log ("ASR 0 at " + to_hex(pc, 6));

	var overflow = 0x100;
	if (size == 1) overflow = 0x10000;
	if (size == 2) overflow = 0x100000000;
	sr &= 0xFFF0; // initially clear all user condition flags but X
	if (shift > 0) sr &= 0xFFEF; // clear X if nonzero shift count
	while (shift--)
	{
		if ((shift == 0) && (x & 1)) sr |= 0x11; // set carry and extend if last bit shifted out is 1
		if (x & (overflow / 2)) x += overflow;
		x = Math.floor(x / 2);
	}
	if (x + x >= overflow) sr |= 8 // negative flag
	if (x == 0) sr |= 4; // zero flag
	return x;
}

function ror(x, shift, size)
{
	//if (shift == 0) console.log ("ROR 0 at " + to_hex(pc, 6));
	
	var overflow = 0x100;
	if (size == 1) overflow = 0x10000;
	if (size == 2) overflow = 0x100000000;
	sr &= 0xFFF0; // initially clear all user condition flags but X
	while (shift--)
	{
		var out = x & 1;
		x >>>= 1;
		if (out) x = x + overflow / 2;
	}
	if (x + x >= overflow) sr |= 0x9 // negative flag and carry flag
	if (x == 0) sr |= 4; // zero flag
	return x;
}

function rol(x, shift, size)
{
	//if (shift == 0) console.log ("ROL 0 at " + to_hex(pc, 6));

	var overflow = 0x100;
	if (size == 1) overflow = 0x10000;
	if (size == 2) overflow = 0x100000000;
	sr &= 0xFFF0; // initially clear all user condition flags but X
	while (shift--)
	{
		x = x + x;
		if (x >= overflow) x = x + 1 - overflow;
	}
	if (x + x >= overflow) sr |= 0x8; // negative flag
	if (x & 1) sr |= 1; // carry flag
	if (x == 0) sr |= 4; // zero flag
	return x;
}

function roxr(x, shift, size)
{
	var overflow = 0x100;
	if (size == 1) overflow = 0x10000;
	if (size == 2) overflow = 0x100000000;
	while (shift--)
	{
		var out = x & 1;
		x >>>= 1;
		if (sr & 0x10) x = x + overflow / 2; // shift 1 in if X was set
		sr = sr & 0xFFE0; // clear all user condition flags including X
		if (out) sr += 0x10; // set X if bit shifted out was set
	}
	if (x + x >= overflow) sr |= 0x9 // negative flag and carry flag
	if (x == 0) sr |= 4; // zero flag
	if (sr & 0x10) sr |= 1; // carry flag gets a copy of the X flag
	return x;
}

function roxl(x, shift, size)
{
	var overflow = 0x100;
	if (size == 1) overflow = 0x10000;
	if (size == 2) overflow = 0x100000000;
	while (shift--)
	{
		x = x + x;
		if (sr & 0x10) x = x + 1; // shift 1 in if X was set
		sr &= 0xFFE0; // clear all user condition flags including X
		if (x >= overflow) {
			x = x - overflow;
			sr += 0x10; // set X if bit was shifted out
		}
	}
	if (x + x >= overflow) sr |= 0x8; // negative flag
	if (sr & 0x10) sr |= 1; // carry flag gets a copy of the X flag
	if (x == 0) sr |= 4; // zero flag
	return x;
}

function aline() { pc -= 2; fire_cpu_exception(10); } // A-Line
function fline() { pc -= 2; fire_cpu_exception(11); } // F-Line

// update the status register in situations that might change S bit (flips A7)

function update_sr(new_sr)
{
	if ((new_sr ^ sr) & 0x2000)
	{
		var t = a7;
		a7 = a8;
		a8 = t;
	}
	sr = new_sr;
}

function an(reg)
{
	switch(reg) {
		case 0: return a0;
		case 1: return a1;
		case 2: return a2;
		case 3: return a3;
		case 4: return a4;
		case 5: return a5;
		case 6: return a6;
		case 7: return a7;
	}
}

function dn(reg)
{
	switch(reg) {
		case 0: return d0;
		case 1: return d1;
		case 2: return d2;
		case 3: return d3;
		case 4: return d4;
		case 5: return d5;
		case 6: return d6;
		case 7: return d7;
	}
}

var MODE_DREG = 0;
var MODE_AREG = 1;
var MODE_AREG_INDIRECT = 2;
var MODE_AREG_POSTINC = 3;
var MODE_AREG_PREDEC = 4;
var MODE_AREG_OFFSET = 5;
var MODE_AREG_INDEX = 6;
var MODE_MISC = 7;
var MISCMODE_SHORT = 0;
var MISCMODE_LONG = 1;
var MISCMODE_PC_OFFSET = 2;
var MISCMODE_PC_INDEX = 3;
var MISCMODE_IMM = 4; 

var instruction_list = ""

// insert into instruction table
function insert_inst(opcode, code, name)
{
	instruction_list += "t[" + opcode +"] = function() { " + code + "};";
	n[opcode] = name;
}

// Check whether the given effective address is valid for common uses
function valid_source(mode, reg)
{
	return mode < 7 || reg <= 4
}

function valid_dest(mode, reg)
{
	return mode < 7 || reg <= 1
}

function valid_calc_effective_address(mode, reg)
{
	return mode == MODE_AREG_INDIRECT || mode == MODE_AREG_OFFSET || mode == MODE_AREG_INDEX || (mode == MODE_MISC && (reg <= 3))
}

// Return friendly name for a size
function size_name(size)
{
	if (size==0) return ".B"
	if (size==1) return ".W"
	return ".L"
}

function get_read(size)
{
	if (size == 0) return "rb"
	if (size == 1) return "rw"
	if (size == 2) return "rl"
}

function get_write(size)
{
	if (size == 0) return "wb"
	if (size == 1) return "ww"
	if (size == 2) return "wl"
}

// Return friendly text description of the addressing mode
function amode_name(mode, reg, size)
{
	if (mode==MODE_DREG) return "D" + (reg)
	if (mode==1) return "A" + (reg)
	if (mode==2) return "(A" + (reg) + ")"
	if (mode==3) return "(A" + (reg) + ")+"
	if (mode==MODE_AREG_PREDEC) return "-(A" + (reg) + ")"
	if (mode==5) return "d(A" + (reg) + ")"
	if (mode==6) return "d(A" + (reg) + ",Dn)"
	if (mode==7 && reg==0) return "xxx.W"
	if (mode==7 && reg==1) return "xxx.L"
	if (mode==7 && reg==2) return "d(PC)"
	if (mode==7 && reg==3) return "d(PC,Dn)"
	if (mode==7 && reg==4) {
		if (size == 0) return "#xx";
		else if (size == 1) return "#xxx";
		else if (size == 2) return "#xxxxxx";
	}
	return "unk"
}

function size_imm(size)
{
	if (size == 0) return " #xx,";
	else if (size == 1) return " #xxx,";
	else if (size == 2) return " #xxxxxx,";
	// else do nothing
}

// Generate code to read bytes after the pc into the specified variable.  Advances the PC unless the
// sideffects variable is set to false.
function read_pc(size, dest, sideeffects)
{
	if (size==0)
	{
		var code = "var " + dest + "=rb(pc+1);"
		return sideeffects ? code + "pc+=2;" : code
	}
	if (size==1)
	{
		var code = "var " + dest + "=rw(pc);"
		return sideeffects ? code + "pc+=2;" : code
	}
	if (size==2)
	{
		var code = "var " + dest + "=rl(pc);"
		return sideeffects ? code + "pc+=4;" : code
	}
}

// generate code for MOVEQ instructions
function build_moveq()
{
	for (var data = 0; data <= 255; data++)
	{
		for (var reg = 0; reg < 8; reg++)
		{
			var opcode = 0x7000 + (reg << 9) + data;
			var code = "sr&=65520;"; // clear all flags (except X)
			code += "d" + reg + " = ";
			if (data < 128) {
				code += data + "; ";
				if (data == 0)
					code += "sr|=4;"; // set zero flag
			}
			else 
				code += (data + 0xFFFFFF00) + "; sr|=8; ";
			insert_inst(opcode, code, "MOVEQ #" + hex_prefix + (data >= 128 ? to_hex(data - 256, 2) : to_hex(data, 2)) + ",D" + reg);
		}
	}
}

// generate code to retrieve from memory by an addressing mode (into variable s)
function amode_read(mode, reg, size, sideeffects)
{
	var increment = size + 1; // pre-decrement / post-increment size
	if (increment == 3)  increment = 4;
	if (increment == 1 && reg == 7) increment = 2;

	// immediate
	if (mode == MODE_MISC && reg == MISCMODE_IMM)
		return read_pc(size, "s", sideeffects);
	//PC-relative
	if (mode == MODE_MISC && reg == MISCMODE_PC_OFFSET)
	{
		var code = read_pc(1, "o", sideeffects);
		code += "var a=pc+ewl(o)-2;"
		code += "var s=" + get_read(size) + "(a);"
		return code;
	}	
	// PC-relative indexed
	if (mode == MODE_MISC && reg == MISCMODE_PC_INDEX)
	{
		var code = read_pc(1, "e", sideeffects)
		code += "var a=e&0xFF;"
		code += "if(a>127)a-=256;"
		code += "a+=pc-2;"
		code += "var x=(e>>>12)&7;"
		code += "var y=(e>32767)?an(x):dn(x);"
		code += "if(!(e&0x800))y=ewl(y);"
		code += "var s=" + get_read(size) + "(y+a);"
		return code;
	}
	// Absolute long
	if (mode == MODE_MISC && reg == MISCMODE_LONG)
	{
		code = read_pc(2, "a", sideeffects)
		code += "var s=" + get_read(size) + "(a);"
		return code;
	}
	// Absolute short
	if (mode == MODE_MISC && reg == MISCMODE_SHORT)
	{
		code = read_pc(1, "a", sideeffects)
		code += "var s=" + get_read(size) + "(ewl(a));"
		return code;
	}
	// address register indirect
	if (mode == MODE_AREG_INDIRECT)
	{
		return "var s=" + get_read(size) + "(a" + reg + ");"
	}
	// address register indirect with postincrement 
	if (mode == MODE_AREG_POSTINC)
	{
		var code = "var s=" + get_read(size) + "(a" + reg + ");" 
		if (sideeffects) code += "a" + reg + "+=" + increment + ";"
		return code;
	}
	// address register indirect with predecrement
	if (mode == MODE_AREG_PREDEC)
	{
		if (sideeffects)
			return "a" + reg + "-=" + increment + ";" + "var s=" + get_read(size) + "(a" + reg + ");" 
		else
			return "var s=" + get_read(size) + "(a" + reg + "-" + increment + ");" 
	}
	// address register indirect with offset
	if (mode == MODE_AREG_OFFSET)
	{
		var code = read_pc(1, "o", sideeffects)
		code += "var a=a" + reg + "+ewl(o);"
		code += "var s=" + get_read(size) + "(a);"
		return code;
	}
	// address register indirect with indexing
	if (mode == MODE_AREG_INDEX)
	{
		var code = read_pc(1, "e", sideeffects)
		code += "var a=e&255;"
		code += "if (a>=128)a-=256;"
		code += "a+=a" + reg + ";"
		code += "var x=(e>>>12)&7;"
		code += "var y=(e>32767)?an(x):dn(x);"
		code += "if(!(e&0x800))y=ewl(y);"
		code += "var s=" + get_read(size) + "(y+a);"
		return code
	}
	// Data register direct
	if (mode == MODE_DREG)
	{
		if (size == 0)
			return "var s=d" + reg + "&255;"
		if (size == 1)
			return "var s=d" + reg + "&65535;"
// The two if are _really_ important for AMS 2.03 92+ to boot.
		if (size == 2)
			return "var s=d" + reg + "; if(s<0)s+=4294967296; if(s>4294967295)s-=4294967296;"
	}
	// a register direct
	if (mode == MODE_AREG)
	{
		if (size == 1)
			return "var s=a" + reg + "&65535;"
// The two if are _really_ important for AMS 2.03 92+ to boot.
		if (size == 2)
			return "var s=a" + reg + "; if(s<0)s+=4294967296; if(s>4294967295)s-=4294967296;"
	}
	return "fire_cpu_exception(4);"; // Illegal instruction
}

function effective_address_calc(mode, reg)
{
	var code = "fire_cpu_exception(4);" // Illegal instruction
	// PC-relative
	if (mode == MODE_MISC && reg == MISCMODE_PC_OFFSET)
	{
		code = read_pc(1, "o", true)
		code += "var z=pc-2+ewl(o);"
		code += "if(z>4294967295)z-=4294967296;"
	}
	// PC-relative indexed
	if (mode == MODE_MISC && reg == MISCMODE_PC_INDEX)
	{
		code = read_pc(1, "e", true)
		code += "var a=e&0xFF;"
		code += "if(a>127)a-=256;"
		code += "a+=pc-2;"
		code += "var x=(e>>>12)&7;"
		code += "var y=(e>32767)?an(x):dn(x);"
		code += "if (!(e&0x800))y=ewl(y);"
		code += "var z=y+a;"
		code += "if(z>4294967295)z-=4294967296;"
	}
	// address register indirect with indexing
	if (mode == MODE_AREG_INDEX)
	{
		code = read_pc(1, "e", true)
		code += "var a = e&0xFF;"
		code += "if(a>127)a-=256;"
		code += "a+=a" + reg + ";"
		code += "var x=(e>>>12)&7;"
		code += "var y=(e>32767)?an(x):dn(x);"
		code += "if (!(e&0x800))y=ewl(y);"
		code += "var z=y+a;"
		code += "if(z>4294967295)z-=4294967296;"
	}
	// Absolute long
	if (mode == MODE_MISC && reg == MISCMODE_LONG)
		code = read_pc(2, "z", true)
	// Absolute short
	if (mode == MODE_MISC && reg == MISCMODE_SHORT)
	{
		code = read_pc(1, "z", true)
		code += "z=ewl(z);"
	}
	// address register indirect with offset
	if (mode == MODE_AREG_OFFSET)
	{
		code = read_pc(1, "o", true)
		code += "var z=a" + reg + "+ewl(o);"
		code += "if(z>4294967295)z-=4294967296;"
	}
	// address register indirect
	if (mode == MODE_AREG_INDIRECT)
		code = "var z=a" + reg + ";"
	return code
}

// generate code to set condition flags based on a value
function set_condition_flags_data(size, s)
{
	var code = "sr&=65520;" // clear negative, zero, overflow, carry
	code += "if(" + s + "==0)sr+=4;" // set zero flag
	if (size == 0) return code + "if(" + s + "&128)sr+=8;" // set negative flag
	if (size == 1) return code + "if(" + s + "&32768)sr+=8;" // set negative flag
	if (size == 2) return code + "if(" + s + "&0x80000000)sr+=8;" // set negative flag
}

// generate code to write the data to the effective a specified by mode and reg of size size
function amode_write(mode, reg, size, data)
{
	var increment = size + 1; // pre-decrement / post-increment size
	if (increment == 3)  increment = 4;
	if (increment == 1 && reg == 7) increment = 2;
	
	// Absolute long
	if (mode == MODE_MISC && reg == MISCMODE_LONG)
		return "var addr = rl(pc); pc += 4; " + get_write(size) + "(addr," + data + ");"
	// Absolute short
	if (mode == MODE_MISC && reg == MISCMODE_SHORT)
		return "var addr = ewl(rw(pc)); pc += 2; " + get_write(size) + "(addr," + data + ");"
	// address register direct
	if (mode == MODE_AREG)
	{
		if (size == 2)
			return "a" + reg + "=" + data + "&4294967295;" // if(a" + reg + "<0)a" + reg + "=4294967296; if(a" + reg + ">4294967295)a" + reg + "-=4294967296;"
		if (size == 1)
			return "a" + reg + "=ewl(" + data + ")&4294967295;" // if(a" + reg + "<0)a" + reg + "=4294967296; if(a" + reg + ">4294967295)a" + reg + "-=4294967296;"
	}
	// address register indirect
	if (mode == MODE_AREG_INDIRECT)
		return get_write(size)+"(a" + reg + "," + data + ");"
	// address register indirect with postincrement 
	if (mode == MODE_AREG_POSTINC)
		return get_write(size)+"(a" + reg + "," + data + "); a" + reg + "+=" + increment + ";"
	// address register indirect with predecrement
	if (mode == MODE_AREG_PREDEC)
		return "a" + reg + "-=" + increment + "; " + get_write(size)+"(a" + reg + "," + data + ");"
	// adress register indirect with offset
	if (mode == MODE_AREG_OFFSET)
		return read_pc(1, "o", true) + get_write(size)+"(a" + reg + "+ewl(o)," + data + ");"
	// address register indirect with indexing
	if (mode == MODE_AREG_INDEX)
	{
		var code = read_pc(1, "e", true)
		code += "var a=e%256;"
		code += "if(a>127)a-=256;"
		code += "a+=a" + reg + ";"
		code += "var x=(e>>>12)&7;"
		code += "var y=(e>32767)?an(x):dn(x);"
		code += "if(!(e&0x800))y=ewl(y);"
		code += get_write(size)+"(a+y," + data + ");"
		return code;
	}
	// Data register direct
	if (mode == MODE_DREG)
	{
		if (size == 2)
			return "d" + reg + "=" + data + "&4294967295;" // if(d" + reg + "<0)d" + reg + "=4294967296; if(d" + reg + ">4294967295)d" + reg + "-=4294967296;"
		if (size == 0)
			return "d" + reg + "=((d" + reg + ">>>8)*256)+(" + data + "&255);"
		if (size == 1)
			return "d" + reg + "=((d" + reg + ">>>16)*65536)+(" + data + "&65535);"
	}
	return "fire_cpu_exception(4);" // Illegal Instruction
}

// build executors for ADDQ and SUBQ

function build_addsubq()
{
	for (var offset = -8; offset < 9; offset++)
		for (var mode = 0; mode < 8; mode++)
			for (var reg = 0; reg < 8; reg++)
				for (var size = 0; size < 3; size++)
					if (valid_dest(mode, reg) && (mode != MODE_AREG || size != 0))
					{
						if (offset == 0) continue; // do not allow add/subtract of 0
						var name = "";
						var opcode = 0;
						if (offset > 0)
						{
							opcode = 0x5000 + (offset << 9)
							if (offset == 8) opcode = 0x5000
							opcode += (size << 6) + (mode << 3) + reg
							name = "ADDQ" + size_name(size) + " #" + offset + "," + amode_name(mode, reg, 0)
						}
						else
						{
							opcode = 0x5100 + ((-offset) << 9)
							if (offset == -8) opcode = 0x5100
							opcode += (size << 6) + (mode << 3) + reg
							name = "SUBQ" + size_name(size) + " #" + (-offset) + "," + amode_name(mode, reg, 0)
						}
						var actualsize = (mode == MODE_AREG) ? 2 : size; // for address registers, always treat as long
						var code = amode_read(mode, reg, actualsize, false);
						if (mode == MODE_AREG) 
						{
							// for address registers we don't set condition codes and thus can use a much simpler operation
							code += "var r=s+" + offset + ";"
							if (offset < 0) code += "if(r<0)r+=4294967296;"
							if (offset > 0) code += "if(r>4294967295)pc+=4294967296;"
						}
						else
						{
							// regular arithmetic with condition flags set for every other destination
							if (size == 0 && offset < 0)
								code +=  "var r=subb(" + (-offset) + ", s);" 
							if (size == 0 && offset > 0)
								code +=  "var r=addb(" + offset + ", s);" 
							if (size == 1 && offset < 0)
								code +=  "var r=subw(" + (-offset) + ", s);" 
							if (size == 1 && offset > 0)
								code +=  "var r=addw(" + offset + ", s);" 
							if (size == 2 && offset < 0)
								code +=  "var r=subl(" + (-offset) + ", s);" 
							if (size == 2 && offset > 0)
								code +=  "var r=addl(" + offset + ", s);" 
							// copy carry flag into X flag
							code += "sr=(sr&0xFFEF)|((sr&1)<<4);"
						}
						code += amode_write(mode, reg, actualsize, "r")
						insert_inst(opcode, code, name);
					}
}

// build all the branches for the given condition, name, and bits
function build_conditionals(condition, name, bits)
{
	var bcc_opcode = 0x6000 + (bits << 8)
	var dbcc_opcode = 0x50C8 + (bits << 8)
	var scc_opcode = 0x50C0 + (bits << 8)
	// Bcc
	for (var o = 0; o < 256; o++)
	{
		var opcode = bcc_opcode + o
		var iname = "B" + name
		if (iname == "BT")
			iname = "BRA"
		if (iname == "BF")
			iname = "BSR"
		if (o == 0)
			iname = iname + ".W disp"
		else
			iname = iname + ".S disp"
		var code = "";
		if (o == 0)
		{
			code = "var o=rw(pc);"
			if (name == "F")
			{
				code += amode_write(4, 7, 2, "(pc+2)")
				code += "if(true)"
			}
			else
			{
				code += condition
			}
			code += "{"
			code +=  "pc+=ewl(o);"
			code +=  "if(pc>4294967295)pc-=4294967296;"
			code +=  "}else pc+= 2;"
		}
		else
		{
			if (name == "F")
				code = amode_write(4, 7, 2, "pc")
			else
				code += condition
			if (o < 128)
				code +=  "pc+=" + o + ";"
			else
				code +=  "pc-=" + (256 - o) + ";"
		}
		insert_inst(opcode, code, iname)
	}

	// DBcc
	for (var reg = 0; reg < 8; reg++)
	{
		var opcode = dbcc_opcode + reg
		var code = condition + "pc+=2; else {"
		code += "var p=d" + reg + ";"
		code +=  "var u=(p>>>16)*65536;"
		code +=  "var l=p%65536;"
		code +=  "var m=(l - 1)&65535;"
		code +=  "d" + reg + "=u+m;"
		code +=  "if(m==65535)"
		code +=  "pc+=2;"
		code +=  "else "
		code +=  "pc=(pc+ewl(rw(pc)))%4294967296;}"
		insert_inst(opcode, code, "DB" + name + " D" + reg + ",disp")
	}

	// Scc
	for (var reg = 0; reg < 8; reg++)
		for (var mode = 0; mode < 8; mode++)
			if (valid_dest(mode, reg) && mode != 1)
			{
				var opcode = scc_opcode + reg + (mode << 3)
				var code = condition + "{"
				code += amode_write(mode, reg, 0, "255")
				code += "} else {"
				code += amode_write(mode, reg, 0, "0")
				code += "}"
				insert_inst(opcode, code, "S" + name + " " + amode_name(mode, reg, 0))
			}
}

// generate standard MOVE instructions
function build_moves(name, size, pattern)
{
	for (var srcmode = 0; srcmode < 8; srcmode++)
		for (var srcreg = 0; srcreg < 8; srcreg++)
			for (var dstmode = 0; dstmode < 8; dstmode++)
			{
				if (size == 0 && (dstmode == 1 || srcmode == 1)) continue; // no byte moves from and to address registers
				for (var dstreg = 0; dstreg < 8; dstreg++)
					if (valid_source(srcmode, srcreg) && valid_dest(dstmode, dstreg))
					{
						var opcode = pattern + (dstreg << 9) + (dstmode << 6) + (srcmode << 3) + srcreg
						var fullname = name + " " + amode_name(srcmode, srcreg, size) + "," + amode_name(dstmode, dstreg, size)
						var code = amode_read(srcmode, srcreg, size, true)
						code += amode_write(dstmode, dstreg, size, "s")
						// set condition codes, except when writing to a registers
						if (dstmode != 1)
							code += set_condition_flags_data(size, "s")
						insert_inst(opcode, code, fullname)
					}
			}
}

function build_movep()
{
	// TODO: emulate this instruction properly instead of a 4-byte NOP.
	// From memory to register
	for (var opmode = 4; opmode < 6; opmode++)
		for (var areg = 0; areg < 8; areg++)
			for (var dreg = 0; dreg < 8; dreg++)
			{
				var opcode = 0x0008 + (dreg << 9) + (opmode << 6) + areg
				var fullname = "MOVEP" + ((opmode & 1) ? ".L " : ".W ") + "d(A" + areg + "),D" + dreg;
				var code = "pc += 2" // TODO
				// condition codes not affected.
				insert_inst(opcode, code, fullname)
			}

	// From register to memory
	for (var opmode = 6; opmode < 8; opmode++)
		for (var areg = 0; areg < 8; areg++)
			for (var dreg = 0; dreg < 8; dreg++)
			{
				var opcode = 0x0008 + (dreg << 9) + (opmode << 6) + areg
				var fullname = "MOVEP" + ((opmode & 1) ? ".L " : ".W ") + "D" + dreg + ",d(A" + areg + ")"
				var code = "pc += 2" // TODO
				// condition codes not affected.
				insert_inst(opcode, code, fullname)
			}
}

// perform a standard operation of given size between given source and dest
function build_operation(name, size, source, dest)
{
	var code = "";
	if (size == 0 && name == "ADD") code = "var r=addb(" + source + "," + dest + ");"
	if (size == 1 && name == "ADD") code = "var r=addw(" + source + "," + dest + ");"
	if (size == 2 && name == "ADD") code = "var r=addl(" + source + "," + dest + ");"
	if (size == 0 && name == "SUB") code = "var r=subb(" + source + "," + dest + ");"
	if (size == 1 && name == "SUB") code = "var r=subw(" + source + "," + dest + ");"
	if (size == 2 && name == "SUB") code = "var r=subl(" + source + "," + dest + ");"
	if (name == "OR") code += "var r=" + source + "|" + dest+ ";"
	if (name == "AND") code += "var r=" + source + "&" + dest+ ";"
	if (name == "EOR") code += "var r=" + source + "^" + dest+ ";"
	if (name == "OR" || name == "AND" || name == "EOR")
	{
		code += "if(r<0)r+=0x100000000;"
		if (size == 0) code += "r&=255;"
		if (size == 1) code += "r&=65535;"
		code += set_condition_flags_data(size, "r")
	}
	return code;
}

// build standard calculation operations
function build_calc(name, bits)
{
	for (var dreg = 0; dreg < 8; dreg++)
		for (var reg = 0; reg < 8; reg++)
			for (var mode = 0; mode < 8; mode++)
				for (var size = 0; size < 3; size++)
				{
					var opcode = bits + (dreg << 9) + (size << 6) + (mode << 3) + reg
					// generate version with EA as source
					if (valid_source(mode, reg) && name != "EOR") // EA as source does work for EOR
					{
						var iname = name + size_name(size) + " " + amode_name(mode, reg, size) + ",D" + dreg
						var code = amode_read(mode, reg, size, true)
						code += build_operation(name, size, "s", "d" + dreg + "")
						code += amode_write(MODE_DREG, dreg, size, "r")
						insert_inst(opcode, code, iname)
					}
					//  generate version with EA as destination
					if (valid_dest(mode, reg) && (mode != MODE_DREG || name == "EOR") && mode != MODE_AREG) //EA as dest does not work for registers
					{
						opcode = opcode + 0x100
						var iname = name + size_name(size) + " D" + dreg + "," + amode_name(mode, reg, size)
						var code = amode_read(mode, reg, size, false)
						code += build_operation(name, size, "d" + dreg, "s")
						code += amode_write(mode, reg, size, "r")
						insert_inst(opcode, code, iname)
					}
				}
}

// build multiply and divide
function build_muldiv(name, bits, calcfunc)
{
	for (var dreg = 0; dreg < 8; dreg++)
		for (var mode = 0; mode < 8; mode++)
			for (var reg = 0; reg < 8; reg++)
				if (valid_source(mode, reg) && mode != MODE_AREG)
				{
					var opcode = bits + (dreg << 9) + (mode << 3) + reg
					var iname = name + " " + amode_name(mode, reg, 1) + ",D" + dreg
					var code = amode_read(mode, reg, 1, true)
					code += "d" + dreg + " = " + calcfunc + "(s,d" + dreg +");";
//					code += "if(d" + dreg + "<0)d" + dreg + "+=4294967296; if(d" + dreg + ">4294967295)d" + dreg + "-=4294967296;"
					insert_inst(opcode, code, iname)
				}
}

// build a bit operation
function build_bit_operation(name, bits)
{
	for (var srcmode = 0; srcmode < 8; srcmode++)
		for (var srcreg = 0; srcreg < 8; srcreg++)
			if (srcmode != 1 && (valid_dest(srcmode, srcreg) || // No bit operations to address registers.
				(name == 'BTST' && srcmode == MODE_MISC && 
				(srcreg == MISCMODE_PC_OFFSET || srcreg == MISCMODE_PC_INDEX))))
				for (var dreg = 0; dreg <= 8; dreg++) // if this value is 8, use bit number static version
				{
					var opcode, iname, code = "";
					if (dreg == 8)
					{
						opcode = bits + (srcmode << 3) + srcreg;
						iname = name + " #xxx," + amode_name(srcmode, srcreg, 0)
					}
					else
					{
						opcode = bits + (srcmode << 3) + srcreg - 0x700 + (dreg << 9);
						iname = name + " D" + dreg + "," + amode_name(srcmode, srcreg, 0)
					}
					if (dreg == 8)
						code = read_pc(1, "b", true)
					if (srcmode <= 1)
					{
						// immediate on a register allows using bits 0-31 of the register's full value
						if (dreg == 8)
							code += "b&=31;"
						else
							code += "b=31&d" + dreg +";"
						code += amode_read(srcmode, srcreg, 2, name == "BTST")
					}
					else
					{
						//  immediate elsewhere uses one byte bits 0-7
						if (dreg == 8)
							code += "b&=7;"
						else
							code +=  "b=7&d" + dreg +";"
						code += amode_read(srcmode, srcreg, 0, name == "BTST")
					}
					code += "sr|=4;" // set zero flag
					code += "if (s&(1<<b))sr=sr&65531;" // clear zero flag if bit is set (nonzero)
					if (name != "BTST")
					{
						if (srcmode <= 1)
						{
							// BCLR immediate on a register allows using bits 0-31 of the register's full value
							if (name == "BCLR") code += "s&=(0xFFFFFFFF-(1<<b));"
							if (name == "BSET") code += "s|=(1<<b);"
							if (name == "BCHG") code += "s^=(1<<b);"
							code += "if(s<0)s+=4294967296;"
							code += amode_write(srcmode, srcreg, 2, "s")
						}
						else
						{
							// BCLR immediate elsewhere uses one byte bits 0-7
							if (name == "BCLR") code += "s&=(255-(1<<b));"
							if (name == "BSET") code += "s|=(1<<b);"
							if (name == "BCHG") code += "s^=(1<<b);"
							code += amode_write(srcmode, srcreg, 0, "s")
						}
					}
					insert_inst(opcode, code, iname)
				}
}

function build_cmp()
{
	for (var size = 0; size < 3; size++)
		for (var srcmode = 0; srcmode < 8; srcmode++)
			for (var srcreg = 0; srcreg < 8; srcreg++)
				for (var firstreg = 0; firstreg < 8; firstreg++)
					if (valid_source(srcmode, srcreg))
					{
						var opcode = 0xB000 + (firstreg << 9) + (size << 6) + (srcmode << 3) + srcreg;
						var iname = "CMP" + size_name(size) + " " + amode_name(srcmode, srcreg, size) + ",D" + firstreg
						var code = amode_read(srcmode, srcreg, size, true)
						code += "m=d" + firstreg + ";"
						if (size == 1) code += "m=m&0xFFFF;"
						if (size == 0) code += "m=m&0xFF;"
						if (size == 0) code += "cmpb(s,m);"
						if (size == 1) code += "cmpw(s,m);"
						if (size == 2) code += "cmpl(s,m);"
						insert_inst(opcode, code, iname)
					}
}

function build_adest()
{
	for (var areg = 0; areg < 8; areg++)
		for (var srcreg = 0; srcreg < 8; srcreg++)
			for (var srcmode = 0; srcmode < 8; srcmode++)
				for (var size = 1; size < 3; size++)
					if (valid_source(srcmode, srcreg))
					{
						var opcode = 0x90C0 + (areg << 9) + ((size - 1) << 8) + (srcmode << 3) + srcreg
						var iname = "SUBA" + size_name(size) + " " + amode_name(srcmode, srcreg, size) + ",A" + areg
						var code = amode_read(srcmode, srcreg, size, true)
						if (size == 1) code += " s = ewl(s);"
						code += "var r=a" + areg + " - s;"
						code += "if(r<0)r+=0x100000000;"
						code += amode_write(1, areg, 2, "r")
						insert_inst(opcode, code, iname)

						opcode = 0xB0C0 + (areg << 9) + ((size - 1) << 8) + (srcmode << 3) + srcreg
						iname = "CMPA" + size_name(size) + " " + amode_name(srcmode, srcreg, size) + ",A" + areg
						code = amode_read(srcmode, srcreg, size, true)
						if (size == 1) code += "s=ewl(s);"
						code += "cmpl(s,a" + areg + ");"
						insert_inst(opcode, code, iname)

						opcode = 0xD0C0 + (areg << 9) + ((size - 1) << 8) + (srcmode << 3) + srcreg
						iname = "ADDA" + size_name(size) + " " + amode_name(srcmode, srcreg, size) + ",A" + areg
						code = amode_read(srcmode, srcreg, size, true)
						if (size == 1) code += "s=ewl(s);"
						code += "var r=a" + areg + "+s;"
						code += "if(r>0xffffffff)r-=0x100000000;"
						code += amode_write(1, areg, 2, "r")
						insert_inst(opcode, code, iname)
					}

}

function build_shifts(name, mask, altmask, namelower)
{
	// register target version
	for (var reg = 0; reg < 8; reg++)
		for (var size = 0; size < 3; size++)
			for (var shift = 0; shift < 8; shift++)
				for (var mm = 0; mm < 2; mm++)
				{
					var actualshift = shift == 0 ? 8 : shift;
					var iname = "";
					var opcode = mask + 0x20 + (size << 6) + reg + (shift << 9);
					if (mm == 0)
					{
						opcode = opcode - 0x20;
						iname = name + size_name(size) + " #" + actualshift + ",D" + reg
					}
					else
					{
						iname = name + size_name(size) + " D" + shift + ",D" + reg
					}
					var shiftamount = mm == 0 ? actualshift : "d" + shift + "&31";
					var src = "";
					if (size == 0) src = "d" + reg + "&255"
					if (size == 1) src = "d" + reg + "&65535"
					if (size == 2) src = "d" + reg
					var code = amode_write(MODE_DREG, reg, size, namelower + "(" + src + "," + shiftamount + "," + size + ")")
					insert_inst(opcode, code, iname)
				}
	// EA target version
	for (var reg = 0; reg < 8; reg++)
		for (var mode = 0; mode < 8; mode++)
			if (valid_dest(mode, reg) && mode != MODE_DREG && mode != MODE_AREG)
			{
				var opcode = altmask + (mode << 3) + reg;
				var iname = name + ".W " + amode_name(mode, reg, 1)
				var code = amode_read(mode, reg, 1, false)
				code += amode_write(mode, reg, 1, namelower + "(s,1,1)")
				insert_inst(opcode, code, iname)
			}
}

function build_immediate(name, mask, operation)
{
	for (var reg = 0; reg < 8; reg++)
		for (var mode = 0; mode < 8; mode++)
			for (var size = 0; size < 3; size++)
				if ((valid_dest(mode, reg) && mode != MODE_AREG) || (mode == MODE_MISC && reg == 4 && size < 2 && operation != ""))
				{
					var opcode = mask + (size << 6) + (mode << 3) + reg
					var mode_name = amode_name(mode, reg, size)
					if (mode == MODE_MISC && reg == 4 && size == 0) mode_name = "CCR"
					if (mode == MODE_MISC && reg == 4 && size == 1) mode_name = "SR"
					var iname = name + size_name(size) + size_imm(size) + mode_name
					var code = read_pc(size, "m", true)
					if (mode == MODE_MISC && reg == 4)
					{
						if (size == 0 && name == "ANDI") code += "m|=0xFF00;"
						code += "update_sr(sr" + operation.substring(7,8) + "m);"
					}
					else
					{
						code += amode_read(mode, reg, size, false)
						if (operation != "")
						{
							//if (name == "ANDI") code += "if (m==0xE00000) tracecount=20;"; 
							code += operation;
							code += set_condition_flags_data(size, "r")
						}
						else
						{
							code += "var r=" + name.substring(0,3).toLowerCase() + size_name(size).substring(1,2).toLowerCase() + "(m,s);"
						}
						code += amode_write(mode, reg, size, "r")
					}
					insert_inst(opcode, code, iname)
				}
}

function build_ext(name, bits)
{
	for (var src = 0; src < 8; src++)
		for (var dst = 0; dst < 8; dst++)
			for (var size = 0; size < 3; size++)
				for (var mem = 0; mem < 2; mem++)
				{
					var opcode = bits + (dst << 9) + (size << 6) + (mem << 3) + src
					var iname = name + size_name(size)
					if (mem == 0)
						iname += " D" + src + ",D" + dst + "'"
					else
						iname += " -(A" + src + "),-(A" + dst + ")'"
					var mode = mem == 0 ? MODE_DREG : mode = MODE_AREG_PREDEC
					var code = amode_read(mode, src, size, true)
					code += "var c=s;"
					code += amode_read(mode, dst, size, false)
					code += "var n=" + name.toLowerCase() + "(c,s," + size + ");"
					code += amode_write(mode, dst, size, "n")
					insert_inst(opcode, code, iname)
				}
}

function build_not_neg()
{
	for (var size = 0; size < 3; size++)
		for (var srcmode = 0; srcmode < 8; srcmode++)
			for (var srcreg = 0; srcreg < 8; srcreg++)
				if (valid_dest(srcmode, srcreg))
				{
					var opcode = 0x4600 + (size << 6) + (srcmode << 3) + srcreg;
					var iname = "NOT" + size_name(size) + " " + amode_name(srcmode, srcreg, size)
					var code = amode_read(srcmode, srcreg, size, false)
					if (size == 0) code += "s=255-s;"
					if (size == 1) code += "s=65535-s;"
					if (size == 2) code += "s=0xFFFFFFFF-s;"
					code += set_condition_flags_data(size, "s")
					code += amode_write(srcmode, srcreg, size, "s")
					insert_inst(opcode, code, iname)

					// *** should fix overflow here sometime
					opcode = 0x4400 + (size << 6) + (srcmode << 3) + srcreg;
					iname = "NEG" + size_name(size) + " " + amode_name(srcmode, srcreg, size)
					code = amode_read(srcmode, srcreg, size, false)
					code += "sr &= 0xFFE0;"
					if (size == 0) code += "var r=s==0?0:256-s;if(r>127)sr|=8;"
					if (size == 1) code += "var r=s==0?0:65536-s;if(r>=32767)sr|=8;"
					if (size == 2) code += "var r=s==0?0:0x100000000-s;if(r>0x7fffffff)sr|=8;"
					code += "if(r==0)sr|=4;else sr|=17;" // set zero flag for zero, extend and carry otherwise
					code += amode_write(srcmode, srcreg, size, "r")
					insert_inst(opcode, code, iname)

					opcode = 0x4000 + (size << 6) + (srcmode << 3) + srcreg;
					iname = "NEGX" + size_name(size) + " " + amode_name(srcmode, srcreg, size)
					code = amode_read(srcmode, srcreg, size, false)
					code += "if(sr&0x10)s++;"
					if (size == 0) code += "var r=256-s;"
					if (size == 1) code += "var r=0x10000-s;"
					if (size == 2) code += "var r=0x100000000-s;if(r>0xffffffff)r=0;"
					code += set_condition_flags_data(size, "r")
					code += amode_write(srcmode, srcreg, size, "r")
					insert_inst(opcode, code, iname)
				}
}

function build_clr_tst_tas()
{
	for (var size = 0; size < 3; size++)
		for (var srcmode = 0; srcmode < 8; srcmode++)
			for (var srcreg = 0; srcreg < 8; srcreg++)
				if (valid_dest(srcmode, srcreg) && srcmode != MODE_AREG)
				{
					var opcode = 0x4200 + (size << 6) + (srcmode << 3) + srcreg;
					var iname =  "CLR" + size_name(size) + " " + amode_name(srcmode, srcreg, size)
					var code = amode_write(srcmode, srcreg, size, "0")
					code += "sr|=4;"
					insert_inst(opcode, code, iname)

					opcode = 0x4a00 + (size << 6) + (srcmode << 3) + srcreg;
					iname = "TST" + size_name(size) + " " + amode_name(srcmode, srcreg, size)
					code = amode_read(srcmode, srcreg, size, true)
					code += set_condition_flags_data(size, "s")
					insert_inst(opcode, code, iname)

					// TAS exists only under byte form.
					if (size == 0)
					{
						opcode = 0x4ac0 + (srcmode << 3) + srcreg;
						iname = "TAS.B" + " " + amode_name(srcmode, srcreg, 0)
						code = amode_read(srcmode, srcreg, 0, true)
						code += set_condition_flags_data(0, "s")
						code += amode_write(srcmode, srcreg, 0, "s | 0x80")
						insert_inst(opcode, code, iname)
					}
				}
}

function build_lea()
{
	for (var srcmode = 0; srcmode < 8; srcmode++)
		for (var srcreg = 0; srcreg < 8; srcreg++)
			for (var reg = 0; reg < 8; reg++)
				if (valid_calc_effective_address(srcmode, srcreg))
				{
					var opcode = 0x41C0 + (reg << 9) + (srcmode << 3) + srcreg;
					var iname = "LEA " + amode_name(srcmode, srcreg, 1) + ",A" + reg
					var code = effective_address_calc(srcmode, srcreg)
					code += "a" + reg + "=z;"
					insert_inst(opcode, code, iname)
				}
}

function build_cmpi()
{
	for (var size = 0; size < 3; size++)
		for (var srcmode = 0; srcmode < 8; srcmode++)
			for (var srcreg = 0; srcreg < 8; srcreg++)
				if (valid_dest(srcmode, srcreg))
				{
					var opcode = 0xC00 + (size << 6) + (srcmode << 3) + srcreg;
					var iname = "CMPI" + size_name(size) + size_imm(size) + amode_name(srcmode, srcreg, size)
					var code = read_pc(size, "subtrahend",true)
					code += amode_read(srcmode, srcreg, size, true)
					if (size==0) code += "cmpb(subtrahend, s);"
					if (size==1) code += "cmpw(subtrahend, s);"
					if (size==2) code += "cmpl(subtrahend, s);"
					insert_inst(opcode, code, iname)
				}
}

function build_movem()
{
	for (var reg = 0; reg < 8; reg++)
		for (var mode = 0; mode < 8; mode++)
			for (var size = 1; size < 3; size++)
			{
				var actualsize = size * 2
				// to registers
				if (mode == MODE_AREG_INDIRECT || 
					mode == MODE_AREG_POSTINC ||
					mode == MODE_AREG_OFFSET || 
					mode == MODE_AREG_INDEX || 
					(mode == MODE_MISC &&
						(reg == MISCMODE_SHORT ||
						 reg == MISCMODE_LONG ||
						 reg == MISCMODE_PC_OFFSET ||
						 reg == MISCMODE_PC_INDEX)))
				{
					var opcode = 0x4c80 + ((size - 1) << 6) + (mode << 3) + reg
					var iname = "MOVEM" + size_name(size + 1) + " " + amode_name(mode, reg, size) + ",regs"
					var code = read_pc(1, "regs", true)
					if (mode == MODE_AREG_POSTINC)
						code += "var newval = load_multiple_postinc(a" + reg + ", regs, " + size + "); a" + reg + " = newval;";
					else
					{
						code += effective_address_calc(mode, reg);
						code += "load_multiple(z,regs," + size + ");"
					}
					insert_inst(opcode, code, iname)
				}

				// from registers
				if (mode == MODE_AREG_INDIRECT || 
					mode == MODE_AREG_PREDEC ||
					mode == MODE_AREG_OFFSET || 
					mode == MODE_AREG_INDEX || 
					(mode == MODE_MISC &&
						(reg == MISCMODE_SHORT ||
						 reg == MISCMODE_LONG)))
				{
					var opcode = 0x4880 + ((size - 1) << 6) + (mode << 3) + reg
					var iname = "MOVEM" + size_name(size) + " regs," + amode_name(mode, reg, size)
					var code = read_pc(1, "regs", true)
					if (mode == MODE_AREG_PREDEC)
					{
						iname = iname.replace("regs", "regspredec");
						code += "var newval = store_multiple_predec(a" + reg + ", regs, " + size + "); a" + reg + " = newval;";
					}
					else
					{
						code += effective_address_calc(mode, reg)
						code += "store_multiple(z, regs, " + size + ");"
					}
					insert_inst(opcode, code, iname)
				}
			}
}

function build_cmpm()
{
	for (var src = 0; src < 8; src++)
		for (var dest = 0; dest < 8; dest++)
			for (var size = 0; size < 3; size++)
			{
				var opcode = 0xB108 + (dest << 9) + (size << 6) + src
				var iname = "CMPM" + size_name(size) + " (A" + src + ")+,(A" + dest + ")+'"
				var code = amode_read(MODE_AREG_POSTINC, src, size, true)
				code += "var u=s;"
				code += amode_read(MODE_AREG_POSTINC, dest, size, true)
				if (size == 0) code += "cmpb(u,s);"
				if (size == 1) code += "cmpw(u,s);"
				if (size == 2) code += "cmpl(u,s);"
				insert_inst(opcode, code, iname)
			}
}

function build_bcd()
{
	// ABCD, SBCD
	for (var src = 0; src < 8; src++)
		for (var dest = 0; dest < 8; dest++)
			for (var m = 1; m >= 0; m--)
				for (var sub = 0; sub <= 1; sub++)
				{
					var operation = sub == 0 ? "ABCD" : "SBCD"
					var opcode = 0x8100 + (dest << 9) + src
					if (operation == "ABCD") opcode += 0x4000
					var iname = ""
					if (m != 0)
					{
						opcode += 8
						iname = operation + " -(A" + src + "),-(A" + dest + ")"
					}
					else
						iname = operation + " D" + src + ",D" + dest
					var code = ""
					if (m != 0)
					{
						code = amode_read(MODE_AREG_PREDEC, src, 0, true)
						code += "var other = s;"
						code += amode_read(MODE_AREG_PREDEC, dest, 0, true)
						code += amode_write(MODE_AREG_INDIRECT, dest, 0, operation.toLowerCase() + "(s,other)")
					}
					else
					{
						code = "d" + dest + "+=" + operation.toLowerCase() + "(d" + dest + ",d" + src + ")-d" + dest + "&0xFF;"
					}
					insert_inst(opcode, code, iname)
				}

	// NBCD, more similar to NEG and NOT (more different EAs are allowed).
	for (var srcmode = 0; srcmode < 8; srcmode++)
		for (var srcreg = 0; srcreg < 8; srcreg++)
			if (valid_dest(srcmode, srcreg) && srcmode != MODE_AREG)
			{
				opcode = 0x4800 + (srcmode << 3) + srcreg;
				iname = "NBCD " + amode_name(srcmode, srcreg, 0)
				code = amode_read(srcmode, srcreg, 0, false)
				code += "var r=nbcd(s);"
				code += amode_write(srcmode, srcreg, 0, "r")
				insert_inst(opcode, code, iname)
			}

}

function build_movesrccr()
{
	for (var srcmode = 0; srcmode < 8; srcmode++)
		for (var srcreg = 0; srcreg < 8; srcreg++)
		{
			if (valid_source(srcmode, srcreg) && srcmode != MODE_AREG)
			{
				var opcode = 0x46C0 + (srcmode << 3) + srcreg;
				var iname = "MOVE " + amode_name(srcmode, srcreg, 1) + ",SR"
				insert_inst(opcode, amode_read(srcmode, srcreg, 1, true) + "update_sr(s);", iname)

				opcode = 0x44C0 + (srcmode << 3) + srcreg;
				iname = "MOVE " + amode_name(srcmode, srcreg, 0) + ",CCR"
				insert_inst(opcode, amode_read(srcmode, srcreg, 0, true) + "sr = (sr&0xFF00) + s;", iname)
			}
			if (valid_dest(srcmode, srcreg) && srcmode != MODE_AREG)
			{
				var opcode = 0x40C0 + (srcmode << 3) + srcreg;
				var iname = "MOVE SR," + amode_name(srcmode, srcreg, 1)
				insert_inst(opcode, amode_write(srcmode, srcreg, 1, "sr"), iname)
			}
		}
}

function build_exchange(xtype, ytype, bits)
{
	for (var x = 0; x < 8; x++)
		for (var y = 0; y < 8; y++)
		{
			var opcode = bits + (x << 9) + y
			var iname = "EXG " + xtype + x + "," + ytype + y
			var xstr = xtype.toLowerCase() + x
			var ystr = ytype.toLowerCase() + y
			var code = "var e=" + xstr + ";"
			code += xstr + "=" + ystr + ";"
			code += ystr + "=e;"
			insert_inst(opcode, code, iname)
		}
}

function build_jmpjsr()
{
	for (var mode = 0; mode < 8; mode++)
		for (var reg = 0; reg < 8; reg++)
			if (valid_calc_effective_address(mode, reg))
				for (var jsr = 1; jsr >= 0; jsr--)
				{
					var opcode = 0x4EC0 + (mode << 3) + reg - jsr * 0x40;
					var iname = (jsr == 1 ? "JSR " : "JMP ") + amode_name(mode, reg, 0)
					var code = effective_address_calc(mode, reg)
					if (jsr == 1)
						code += amode_write(4, 7, 2, "pc")
					code += "pc=z;"
					insert_inst(opcode, code, iname)
				}
}

function build_pea()
{
	for (var srcmode = 0; srcmode < 8; srcmode++)
		for (var srcreg = 0; srcreg < 8; srcreg++)
			if (valid_calc_effective_address(srcmode, srcreg))
			{
				var opcode = 0x4840 + (srcmode << 3) + srcreg;
				var iname = "PEA " + amode_name(srcmode, srcreg, 0)
				insert_inst(opcode, effective_address_calc(srcmode, srcreg) + amode_write(4, 7, 2, "z"), iname)
			}
}

function build_swap()
{
	for (var reg = 0; reg < 8; reg++)
	{
		var code = "var l = d" + reg + "&65535;"
		code += "var h = d" + reg + " >>> 16;"
		code += "d" + reg + " = (l * 65536) + h;"
		insert_inst(0x4840 + reg, code, "SWAP D" + reg)
	}
}

function build_chk()
{
	for (var srcmode = 0; srcmode < 8; srcmode++)
		for (var srcreg = 0; srcreg < 8; srcreg++)
			for (var reg = 0; reg < 8; reg++)
				if (valid_dest(srcmode, srcreg) && srcmode != MODE_AREG)
				{
					var opcode = 0x4180 + (reg << 9) + (srcmode << 3) + srcreg;
					var iname = "CHK.W " + amode_name(srcmode, srcreg, 1) + ",D" + reg
					var code = amode_read(srcmode, srcreg, 1, true)
					code += "if (d" + reg + "<0) { sr |= 8; raise_cpu_exception(6); } if(d" + reg + "> s) { sr &= 0xFFF7; raise_cpu_exception(6); }"
					insert_inst(opcode, code, iname)
				}
}

// fill default instruction table, initially all unimplemented instructions 

// fill unhandled instructions by default
function build_initial_instructions_handlers()
{
	var i;
	for (i = 0; i < 0xA000; i++) {
		t[i] = make_unhandled(i);
		n[i] = "UNKNOWN";
	}

	for (i = 0xA000; i <= 0xAFFF; i++) {
		t[i] = aline;
		n[i] = "ALINE " + to_hex(i,3);
	}

	for (i = 0xB000; i < 0xF000; i++) {
		t[i] = make_unhandled(i);
		n[i] = "UNKNOWN";
	}

	for (i = 0xF000; i <= 0xFFFF; i++) {
		t[i] = fline;
		n[i] = "FLINE " + to_hex(i,3);
	}
}


build_initial_instructions_handlers();

build_moveq();
build_addsubq();
// bit patterns specifying size are different for MOVE than most other instructions, and Sybex book has them wrong!
build_moves("MOVE.L", 2, 0x2000);
build_moves("MOVE.W", 1, 0x3000);
build_moves("MOVE.B", 0, 0x1000);
build_movep(); // TODO: proper implementation, instead of a 4-byte NOP
build_conditionals("if(true)", "T", 0)
build_conditionals("if(false)", "F", 1)
build_conditionals("if(!(sr&5))", "HI", 2)
build_conditionals("if(sr&5)", "LS", 3)
build_conditionals("if(!(sr&1))", "CC", 4)
build_conditionals("if(sr&1)", "CS", 5)
build_conditionals("if(!(sr&4))", "NE", 6)
build_conditionals("if(sr&4)", "EQ", 7)
build_conditionals("if(!(sr&2))", "VC", 8)
build_conditionals("if(sr&2)", "VS", 9)
build_conditionals("if(!(sr&8))", "PL", 10)
build_conditionals("if(sr&8)", "MI", 11)
build_conditionals("if(((sr&10)==0)||((sr&10)==10))", "GE", 12)
build_conditionals("if(((sr&10)==8)||((sr&10)==2))", "LT", 13)
build_conditionals("if((((sr&10)==0)||((sr&10)==10))&(!(sr&4)))", "GT", 14)
build_conditionals("if((sr&4)||((sr&10)==8)||((sr&10)==2))", "LE", 15)
build_calc("EOR", 0xB000)
build_calc("ADD", 0xD000)
build_calc("AND", 0xC000)
build_calc("SUB", 0x9000)
build_calc("OR", 0x8000)
build_muldiv("DIVS", 0x81C0, "divs")
build_muldiv("DIVU", 0x80C0, "divu")
build_muldiv("MULS", 0xC1C0, "muls")
build_muldiv("MULU", 0xC0C0, "mulu")
build_bit_operation("BCLR", 0x880)
build_bit_operation("BTST", 0x800)
build_bit_operation("BCHG", 0x840)
build_bit_operation("BSET", 0x8c0);
build_shifts("ASL", 0xE100, 0xE1C0, "asl")
build_shifts("ASR", 0xE000, 0xE0C0, "asr")
build_shifts("LSL", 0xE108, 0xE3C0, "lsl")
build_shifts("LSR", 0xE008, 0xE2C0, "lsr")
build_shifts("ROXL", 0xE110, 0xE5C0, "roxl")
build_shifts("ROXR", 0xE010, 0xE4C0, "roxr")
build_shifts("ROL", 0xE118, 0xE7C0, "rol")
build_shifts("ROR", 0xE018, 0xE6C0, "ror")
build_cmp()
build_adest()
build_immediate("ORI", 0, "var r=s|m;")
build_immediate("ANDI", 0x200, "var r=s&m;")
build_immediate("EORI", 0xA00, "var r=s^m;")
build_immediate("ADDI", 0x600, "")
build_immediate("SUBI", 0x400, "")
build_ext("ADDX", 0xD100)
build_ext("SUBX", 0x9100)
build_not_neg()
build_clr_tst_tas()
build_lea()
build_cmpi()
build_movem()
build_cmpm()
build_bcd()
build_exchange("D", "D", 0xC140)
build_exchange("A", "A", 0xC148)
build_exchange("D", "A", 0xC188)
insert_inst(0x4E71, "", "NOP")
insert_inst(0x4E72, "pc+=2", "STOP #xxx") // TODO: proper implementation, instead of a 4-byte NOP
insert_inst(0x4E73, "var s=rw(a7);a7+=2;pc=rl(a7);a7+=4;update_sr(s)", "RTE")
insert_inst(0x4E75, "pc=rl(a7);a7+=4;", "RTS")
insert_inst(0x4E76, "if(sr&2)fire_cpu_exception(7)", "TRAPV") // TRAPV
insert_inst(0x4E77, "var s=rw(a7);a7+=2;pc=rl(a7);a7+=4;sr=(sr&0xFFE0)|(s&0x001F)", "RTR")
insert_inst(0x4AFC, "fire_cpu_exception(4)", "ILLEGAL") // Illegal instruction
build_movesrccr()
build_jmpjsr()
build_pea()
build_swap()
build_chk()
for (var vector = 0; vector < 16; vector++)
	insert_inst(0x4E40 + vector, "fire_cpu_exception(" + (32 + vector) + ")", "TRAP #" + vector) // TRAP #
for (var reg = 0; reg < 8; reg++)
{
	insert_inst(0x4E60 + reg, "if(sr&0x2000==0)fire_cpu_exception(8);a8=a" + reg, "MOVE A" + reg + ",USP") // Privilege violation
	insert_inst(0x4E68 + reg, "if(sr&0x2000==0)fire_cpu_exception(8);a" + reg +"=a8", "MOVE USP,A" + reg) // Privilege violation
	insert_inst(0x4880 + reg, "d" + reg + "=((d" + reg + ">>>16)*65536)+ebw(d" + reg + ")", "EXT.W D" + reg)
	insert_inst(0x48C0 + reg, "d" + reg + "=ewl(d" + reg + ")", "EXT.L D" + reg)
	var linkcode = "a7-=4; wl(a7,a" + reg + "); var o=rw(pc); pc+=2; a" + reg + "=a7; a7+=(o<0x8000?o:o-0x10000);"
	insert_inst(0x4e50 + reg, linkcode, "LINK A" + reg + ",#xxx")
	var unlkcode ="a7 = a" + reg + "; var s=rl(a7); a7+=4; a" + reg + " = s;"
	insert_inst(0x4e58 + reg, unlkcode, "UNLK A " + reg)
}
eval(instruction_list);


var unknown = 0
for (var i = 0; i < 65536; i++) {
	if (n[i] == "UNKNOWN") {
		unknown++;
		n[i] = "DC.W " + hex_prefix + to_hex(i, 4);
	}
}
console.log("number of unknown opcodes is " + unknown)


// read a hardware register (byte)
function read_hreg(reg)
{
	switch (reg)
	{
		case 0x600000: // 0x600000
		{
			return 0x04;
		}

		case 0x600001: // 0x600001
		{
			return vectorprotect ? 4 : 0;
		}

		case 0x60000c: // 0x60000c
		{
			//console.log("read link configuation: " + to_hex(link_config, 2));
			return link_config;
		}

		case 0x60000d: // 0x60000d
		{
			var status = 2;
			if (link_incoming_queue.length > 0 && typeof(link_incoming_queue[0]) == "number") status |= 0x30;
			else if (link_config & 2) status |= 0x50;
			//console.log("read link status: " + to_hex(status, 2));
			return status;
		}

		case 0x60000e: // 0x60000e
		{
			return 0x10;
		}

		case 0x60000f: // 0x60000f
		{
			if (link_incoming_queue.length > 0 && typeof(link_incoming_queue[0]) == "number")
			{
				//console.log("reading link buffer: " + to_hex(link_incoming_queue[0], 2));
				return link_incoming_queue.shift();
			}
			else
			{
				//console.log("tried to read link buffer, returned 0 because no data");
				return 0;
			}
		}

		case 0x600015: // 0x600015
		{
			return interrupt_control; // default value for interrupt / display control
		}

		case 0x600017: // 0x600017
		{
			return timer_current; // programmable timer
		}

		case 0x600018: // 0x600018
		{
			return keymaskhigh; // which keys are readable
		}

		case 0x600019: // 0x600019
		{
			return keymasklow; // which keys are readable
		}

		case 0x60001a: // 0x60001a
		{
			return port_60001A; // ON key read
		}

		case 0x60001b: // 0x60001b
		{
			// keyboard read - treat as no keys pressed
			var result = 0xFF;
			var keymask = keymaskhigh * 256 + keymasklow;
			for (var row = 0; row <= 9; row++) 
			{
				if ((keymask & (1 << row)) == 0) 
				{
					for (var col = 0; col < 8; col++) 
					{
						if (keystatus[row * 8 + col] == 1)
						{
							result &= (0xFF - (1 << col));
						}
					}
				}
			}
			return result;
		}

		case 0x60001d: // 0x60001d
		{
			return port_60001D; // contrast setting - 0x8F would be better ?
		}

		case 0x700017: // 0x700017: HW2 snoop palette range.
		{
			return 0x00;
		}

		case 0x70001d: // 0x70001d
		{
			return port_70001D;
		}
		
		case 0x70001f: // 0x70001f
		{
			return port_70001F;
		}

		default:
		{
			//console.log("pc " + to_hex(pc, 6) + ": read from " + to_hex(reg, 6));
			return (reg & 1) ? 0 : 0x14;
		}
	}
}

// write a hardware register (byte)
function write_hreg(reg, value)
{
	switch (reg)
	{
		case 0x600000: // 0x600000
		{
			//port_600000 = value;
			break;
		}

		case 0x600001: // 0x600001
		{
			vectorprotect = ((value & 4) == 4);
			break;
		}

		case 0x600002: // 0x600002: wait states, not needed on 89 hardware according to J89hw.txt.
		case 0x600003: // 0x600003
		{
			// Ignore.
			break;
		}

		case 0x600005: // 0x600005
		{
			wakemask = value;
			throw "STOP";
			break;
		}

		case 0x60000c: // 0x60000c
		{
			link_config = value;
			if (value & 2 == 0) transmit_finished = false;
			//console.log("writing link configuation: " + to_hex(link_config, 2));
			break;
		}

		case 0x60000f: // 0x60000f
		{
			link_outgoing_queue.push(value);
			//console.log("writing to link buffer: " + to_hex(value, 2));
			transmit_finished = true;
			break;
		}

		case 0x600010: // 0x600010
		{
			lcd_address_high = value;
			break;
		}

		case 0x600011: // 0x600011
		{
			lcd_address_low = value;
			break;
		}

		// 600012: logical LCD width.

		case 0x600013: // 0x600013
		{
			screen_height = value;
			break;
		}

		case 0x600014: // 0x600014: nothing, but some writes to port 600015 are word writes.
		{
			// Ignore.
			break;
		}

		case 0x600015: // 0x600015
		{
			interrupt_control = value;
			switch ((interrupt_control >> 4) & 0x3)
			{
				case 0:
					interrupt_rate = 0x20;
					break;
				case 1:
					interrupt_rate = 0x200;
					break;
				case 2:
					interrupt_rate = 0x1000;
					break;
				case 3:
					interrupt_rate = 0x40000;
					break;
			}
			console.log("writing interrupt_control: " + to_hex(interrupt_control, 2));
			break;
		}

		case 0x600016: // 0x600016: nothing, but some writes to port 600016 are word writes.
		{
			// Ignore.
			break;
		}

		case 0x600017: // 0x600017: programmable timer
		{
			timer_current = value; timer_min = value;
			break;
		}

		case 0x600018: // 0x600018
		{
			keymaskhigh = value;
			break;
		}

		case 0x600019: // 0x600019
		{
			keymasklow = value;
			break;
		}

		case 0x60001a: // 0x60001a: acknowledge AUTO_INT_6
		{
			port_60001A = value;
			break;
		}

		case 0x60001b: // 0x60001b: acknowledge AUTO_INT_2
		{
			// TODO: implement this.
			break;
		}

		case 0x60001d: // 0x60001d
		{
			port_60001D = value;
			break;
		}

		case 0x700000: // 0x700000: RAM execution protection.
		case 0x700001: // 0x700001
		case 0x700002: // 0x700002
		case 0x700003: // 0x700003
		case 0x700004: // 0x700004
		case 0x700005: // 0x700005
		case 0x700006: // 0x700006
		case 0x700007: // 0x700007
		case 0x700008: // 0x700008: RAM execution protection (ghosts)
		case 0x700009: // 0x700009
		case 0x70000a: // 0x70000a
		case 0x70000b: // 0x70000b
		case 0x70000c: // 0x70000c
		case 0x70000d: // 0x70000d
		case 0x70000e: // 0x70000e
		case 0x70000f: // 0x70000f
		{
			// Ignore. This protection is nothing more than an impediment, and emulating it would slow the emulator down.
			break;
		}

		case 0x700010: // 0x700010: link port transfer speed.
		case 0x700011: // 0x700011
		{
			// Ignore, we're not emulating link port that way.
			break;
		}

		case 0x700012: // 0x700012: Flash ROM execution protection.
		case 0x700013: // 0x700013
		{
			// Ignore. This protection is nothing more than an impediment, and emulating it would slow the emulator down.
			break;
		}

		case 0x70001c: // 0x70001c
		{
			// Ignore: the battery checker code does word writes, but there's nothing at 70001C, AFAWCT.
			break;
		}

		case 0x70001d: // 0x70001d
		{
			port_70001D = value;
			break;
		}

		case 0x70001f: // 0x70001f
		{
			port_70001F = value;
			break;
		}

		default:
		{
			//console.log("pc " + to_hex(pc, 6) + ": write " + to_hex(value, 2) + " to " + to_hex(reg, 6));
			break;
		}
	}
}


var rw = function(address)
{
	// Dummy implementation, will be overridden later.
}

var rb = function(address)
{
	// Dummy implementation, will be overridden later.
}

var memory_read_functions = "";

function build_memory_read_functions(suffix, flashmemoryaddress, flashmemorysize)
{
	memory_read_functions +=
"function rw_" + suffix + "_normal(address)" +
"{" +
"	address = address & 0xFFFFFF;" +
"	if ((address % 2) != 0) fire_cpu_exception(3);" + // Address Error
"	if (address < 0x200000) {" + // RAM and ghosts (HW1, HW2 - ignore HW3 & HW4 ghosts at 200000 & 400000, nobody uses that)
"		return ram[(address >>> 1) & 0x3FFFF];" +
"	}" +
"	else if (address >= " + flashmemoryaddress + " && address < " + eval(flashmemoryaddress + flashmemorysize) + ") {" +
"		return rom[(address - " + flashmemoryaddress + ")/2];" +
"	}" +
"	else if (address >= 0x600000 && address < 0x800000) {" +
"		return read_hreg(address) * 256 + read_hreg(address + 1);" +
"	}" +
"	else" +
"		return 0x1400;" +
"}" +
"" +
"function rb_" + suffix + "_normal(address)" +
"{" +
"	address = address & 0xFFFFFF;" +
"	if (address < 0x200000) {" + // RAM and ghosts (HW1, HW2 - ignore HW3 & HW4 ghosts at 200000 & 400000, nobody uses that)
"		if (address % 2 == 0) {" +
"			return ram[(address >>> 1) & 0x3FFFF] >>> 8;" +
"		}" +
"		else {" +
"			return ram[(address >>> 1) & 0x3FFFF] & 0xFF;" +
"		}" +
"	}" +
"	else if (address >= " + flashmemoryaddress + " && address < " + eval(flashmemoryaddress + flashmemorysize) + ") {" +
"		if (address % 2 == 0) {" +
"			return rom[(address - " + flashmemoryaddress + ") >>> 1] >>> 8;" +
"		}" +
"		else {" +
"			return rom[(address - " + flashmemoryaddress + "- 1) >>> 1] & 0xFF;" +
"		}" +
"	}" +
"	else if (address >= 0x600000 && address < 0x800000) {" +
"		return read_hreg(address);" +
"	}" +
"	else" +
"		return (address & 1) ? 0 : 0x14;" +
"}" +
"" +
"function rw_" + suffix + "_flash(address)" +
"{" +
"	address = address & 0xFFFFFF;" +
"	if ((address % 2) != 0) fire_cpu_exception(3);" + // Address Error
"	if (address < 0x200000) {" + // RAM and ghosts (HW1, HW2 - ignore HW3 & HW4 ghosts at 200000 & 400000, nobody uses that)
"		return ram[(address >>> 1) & 0x3FFFF];" +
"	}" +
"	else if (address >= " + flashmemoryaddress + " && address < " + eval(flashmemoryaddress + flashmemorysize) + ") {" +
"		if (flash_write_phase == 0x90) {" + // Read identifier codes mode
"			switch (address & 0xffff) {" +
"				case 0:  return " + ((suffix == 8 || suffix == 9) ? "0x00b0" : "0x0089") + ";" + // manufacturer code
"				case 2:  return 0x00b5;" + // device code
"				default: return 0xffff;" +
"			}" +
"		}" +
"		else {" +
"			return rom[(address - " + flashmemoryaddress + ")/2] | flash_ret_or;" +
"		}" +
"	}" +
"	else if (address >= 0x600000 && address < 0x800000) {" +
"		return read_hreg(address) * 256 + read_hreg(address + 1);" +
"	}" +
"}" +
"" +
"function rb_" + suffix + "_flash(address)" +
"{" +
"	address = address & 0xFFFFFF;" +
"	if (address < 0x200000) {" + // RAM and ghosts (HW1, HW2 - ignore HW3 & HW4 ghosts at 200000 & 400000, nobody uses that)
"		if (address % 2 == 0) {" +
"			return ram[(address >>> 1) & 0x3FFFF] >>> 8;" +
"		}" +
"		else {" +
"			return ram[(address >>> 1) & 0x3FFFF] & 0xFF;" +
"		}" +
"	}" +
"	else if (address >= " + flashmemoryaddress + " && address < " + eval(flashmemoryaddress + flashmemorysize) + ") {" +
"		if (flash_write_phase == 0x90) {" + // Read identifier codes mode; not sure anyone uses it under byte form...
"			switch (address & 0xffff) {" +
"				case 0:  return 0x00;" +
"				case 1:  return " + ((suffix == 8 || suffix == 9) ? "0xb0" : "0x89") + ";" + // manufacturer code
"				case 2:  return 0x00;" +
"				case 3:  return 0xb5;" + // device code
"				default: return 0xff;" +
"			}" +
"		}" +
"		else {" +
"			if (address % 2 == 0) {" +
"				return ((rom[(address - " + flashmemoryaddress + ") >>> 1] >>> 8) | flash_ret_or) & 0xFF;" +
"			}" +
"			else {" +
"				return (rom[(address - " + flashmemoryaddress + "- 1) >>> 1] | flash_ret_or) & 0xFF;" +
"			}" +
"		}" +
"	}" +
"	else if (address >= 0x600000 && address < 0x800000) {" +
"		return read_hreg(address);" +
"	}" +
"}";
}

build_memory_read_functions("1", 0x400000, 0x200000); // 92+
build_memory_read_functions("3", 0x200000, 0x200000); // 89
build_memory_read_functions("8", 0x200000, 0x400000); // V200
build_memory_read_functions("9", 0x800000, 0x400000); // 89T

eval(memory_read_functions);

function rl(address)
{
	var high_word = rw(address);
	var low_word = rw(address + 2);
	return ((high_word * 65536 + low_word));
}


var ww = function(address, value)
{
	// Dummy implementation, will be overridden later.
}

var wb = function(address, value)
{
	// Dummy implementation, will be overridden later.
}

var memory_write_functions = "";

function build_memory_write_functions(suffix, flashmemoryaddress, flashmemorysize)
{
	memory_write_functions +=
"function ww_" + suffix + "_normal(address, value)" +
"{" +
"	address = address & 0xFFFFFF;" +
"	if ((address % 2) != 0) fire_cpu_exception(3);" + // Address Error
"	if (address < 0x200000) {" +
"		ram[(address & 0x3FFFF) / 2] = value;" +
"	}" +
"	else if (address >= " + flashmemoryaddress + " && address < " + eval(flashmemoryaddress + flashmemorysize) + ") {" + // Flash write support.
"		if ((pc < 0x40000) && !Protection_enabled) {" + // This write runs from RAM, with Protection disabled... chances are that we want to switch to the special mode.
//"console.log(\"Switch to special\");" +
"			ww = ww_" + suffix + "_flash;" + // Redefine functions
"			rw = rw_" + suffix + "_flash;" +
"			rb = rb_" + suffix + "_flash;" +
"			ww_" + suffix + "_flash(address, value);" + // Forward to special function
"		}" +
"	}" +
"	else if (address >= 0x600000 && address < 0x800000) {" +
"		write_hreg(address, (value >> 8) & 0xFF);" +
"		write_hreg(address + 1, value & 0xFF);" +
"	}" +
"}" +
"" +
"function wb_" + suffix + "_normal(address, value)" +
"{" +
"	address = address & 0xFFFFFF;" +
"	if (address < 0x200000)" +
"	{" +
"		address &= 0x3FFFF;" +
"		if (address % 2 == 0) {" +
"			ram[address / 2] = (ram[address / 2] & 0xFF) + (value * 256);" +
"		}" +
"		else {" +
"			ram[address >> 1] = (ram[address >> 1] & 0xFF00) + value;" +
"		}" +
"	}" +
// Flash write bytes not implemented for now - does anyone use them ?
"	else if (address >= 0x600000 && address < 0x800000) {" +
"		write_hreg(address, value & 0xFF);" +
"	}" +
"}" +
"" +
"function ww_" + suffix + "_flash(address, value)" +
"{" +
"	address = address & 0xFFFFFF;" +
"	if ((address % 2) != 0) fire_cpu_exception(3);" + // Address Error
"	if (address < 0x200000) {" +
"		ram[(address & 0x3FFFF) / 2] = value;" +
"	}" +
"	else if (address >= " + flashmemoryaddress + " && address < " + eval(flashmemoryaddress + flashmemorysize) + ") {" +
"		if (flash_write_ready) {" + // Write the value to Flash, if we're ready.
"			rom[(address - " + flashmemoryaddress + ") / 2] &= value;" +
"			flash_write_ready--;" +
"			flash_ret_or = 0xffffffff;" +
"		}" +
"		else if (value == 0x5050) {" + // Clear status register
"			flash_write_phase = 0x50;" +
"		}" +
"		else if (value == 0x9090) {" + // Read identifier codes
"			flash_write_phase = 0x90;" +
"		}" +
"		else if (value == 0x1010) {" + // Byte write setup/confirm
"			if (flash_write_phase == 0x50) {" +
"				flash_write_ready = 1;" +
"				flash_write_phase = 0x50;" +
"			}" +
"		}" +
"		else if (value == 0x2020) {" + // Block erase setup/confirm
"			if (flash_write_phase == 0x50) {" +
"				flash_write_phase = 0x20;" +
"			}" +
"		}" +
"		else if (value == 0xD0D0) {" + // Confirm and block erase
"			if (flash_write_phase == 0x20) {" +
"				flash_write_phase = 0xd0;" +
"				flash_ret_or = 0xffffffff;" +
"				address &= 0xFF0000;" +
"				address -= " + flashmemoryaddress + ";" +
"				address >>>= 1;" +
"				for (var i = 0; i < 65536/2; i++, address++) {" +
"					rom[address] = 0xFFFF;" +
"				}" +
"			}" +
"		}" +
"		else if (value == 0xFFFF) {" + // read array/reset
"			if (flash_write_phase == 0x50) {" +
"				flash_write_ready = 0;" +
"				flash_ret_or = 0;" +
//"console.log(\"Switch to normal\");" +
"				ww = ww_" + suffix + "_normal;" + // Redefine functions
"				rw = rw_" + suffix + "_normal;" +
"				rb = rb_" + suffix + "_normal;" +
"			}" +
"		}" +
"	}" +
"	else if (address >= 0x600000 && address < 0x800000) {" +
"		write_hreg(address, (value >> 8) & 0xFF);" +
"		write_hreg(address + 1, value & 0xFF);" +
"	}" +
"}";
}

build_memory_write_functions("1", 0x400000, 0x200000); // 92+
build_memory_write_functions("3", 0x200000, 0x200000); // 89
build_memory_write_functions("8", 0x200000, 0x400000); // V200
build_memory_write_functions("9", 0x800000, 0x400000); // 89T

eval(memory_write_functions);

function wl(address, value)
{
	ww(address, value >>> 16);
	ww(address + 2, value & 0xFFFF);
}

var movem_handlers = "";

// MOVEM handlers. We generate them because eval() takes a severe toll on performance (about an order of magnitude).
// Might optimize them further (on average) by splitting all loops in 2, and returning if mask == 0.
// NOTE: constant-propagating size into the functions' body (splitting each movem handler in two) _slows down_ emulation, for some reason, at least on Firefox. Yes, really.
function build_movem_handlers() {
	var reg;

// store_multiple
	movem_handlers += "function store_multiple(address, mask, size) {" +
"	if (size == 1) {";
	for (reg = 0; reg <= 7; reg++) {
		movem_handlers += "		if (mask & 1) {" +
"			ww(address, d" + reg + ");" +
"			address += 2;" +
"		}" +
"		mask >>>= 1;";
	}
	for (reg = 0; reg <= 3; reg++) {
		movem_handlers += "			if (mask & 1) {" +
"				ww(address, a" + reg + ");" +
"				address += 2;" +
"			}" +
"			mask >>>= 1;";
	}
	movem_handlers += "if (!mask) return;";
	for (reg = 4; reg <= 7; reg++) {
		movem_handlers += "		if (mask & 1) {" +
"			ww(address, a" + reg + ");" +
"			address += 2;" +
"		}" +
"		mask >>>= 1;";
	}
	movem_handlers += "	}" +
"	else {";
	for (reg = 0; reg <= 7; reg++) {
		movem_handlers += "		if (mask & 1) {" +
"			wl(address, d" + reg + ");" +
"			address += 4;" +
"		}" +
"		mask >>>= 1;";
	}
	for (reg = 0; reg <= 3; reg++) {
		movem_handlers += "		if (mask & 1) {" +
"			wl(address, a" + reg + ");" +
"			address += 4;" +
"		}" +
"		mask >>>= 1;";
	}
	movem_handlers += "if (!mask) return;";
	for (reg = 4; reg <= 7; reg++) {
		movem_handlers += "		if (mask & 1) {" +
"			wl(address, a" + reg + ");" +
"			address += 4;" +
"		}" +
"		mask >>>= 1;";
	}
	movem_handlers +=  "	}" +
"}";

// store_multiple_predec
	movem_handlers += "function store_multiple_predec(address, mask, size)" +
"{" +
"	if (size == 1) {";
	for (reg = 7; reg >= 0; reg--) {
		movem_handlers += "		if (mask & 1) {" +
"			address -= 2;" +
"			ww(address, a" + reg + ");" +
"		}" +
"		mask >>>= 1;";
	}
	for (reg = 7; reg >= 4; reg--) {
		movem_handlers += "		if (mask & 1) {" +
"			address -= 2;" +
"			ww(address, d" + reg + ");" +
"		}" +
"		mask >>>= 1;";
	}
	movem_handlers += "if (!mask) return address;";
	for (reg = 3; reg >= 0; reg--) {
		movem_handlers += "		if (mask & 1) {" +
"			address -= 2;" +
"			ww(address, d" + reg + ");" +
"		}" +
"		mask >>>= 1;";
	}
	movem_handlers += "	}" +
"	else {";
	for (reg = 7; reg >= 0; reg--) {
		movem_handlers += "		if (mask & 1) {" +
"			address -= 4;" +
"			wl(address, a" + reg + ");" +
"		}" +
"		mask >>>= 1;";
	}
	for (reg = 7; reg >= 4; reg--) {
		movem_handlers += "		if (mask & 1) {" +
"			address -= 4;" +
"			wl(address, d" + reg + ");" +
"		}" +
"		mask >>>= 1;";
	}
	movem_handlers += "if (!mask) return address;";
	for (reg = 3; reg >= 0; reg--) {
		movem_handlers += "		if (mask & 1) {" +
"			address -= 4;" +
"			wl(address, d" + reg + ");" +
"		}" +
"		mask >>>= 1;";
	}
	movem_handlers += "	}" +
"	return address;" +
"}";

// load_multiple
	movem_handlers += "function load_multiple(address, mask, size)" +
"{" +
"	if (size == 1) {";
	for (reg = 0; reg <= 7; reg++) {
		movem_handlers += "		if (mask & 1) {" +
"			var value = ewl(rw(address));" +
"			address += 2;" +
"			d" + reg + "= value;" +
"		}" +
"		mask >>>= 1;";
	}
	for (reg = 0; reg <= 3; reg++) {
		movem_handlers += "		if (mask & 1) {" +
"			var value = ewl(rw(address));" +
"			address += 2;" +
"			a" + reg + "= value;" +
"		}" +
"		mask >>>= 1;";
	}
	movem_handlers += "if (!mask) return;";
	for (reg = 4; reg <= 7; reg++) {
		movem_handlers += "		if (mask & 1) {" +
"			var value = ewl(rw(address));" +
"			address += 2;" +
"			a" + reg + "= value;" +
"		}" +
"		mask >>>= 1;";
	}
	movem_handlers += "	}" +
"	else {";
	for (reg = 0; reg <= 7; reg++) {
		movem_handlers += "		if (mask & 1) {" +
"			var value = rl(address);" +
"			address += 4;" +
"			d" + reg + "= value;" +
"		}" +
"		mask >>>= 1;";
	}
	for (reg = 0; reg <= 3; reg++) {
		movem_handlers += "		if (mask & 1) {" +
"			var value = rl(address);" +
"			address += 4;" +
"			a" + reg + "= value;" +
"		}" +
"		mask >>>= 1;";
	}
	movem_handlers += "if (!mask) return;";
	for (reg = 4; reg <= 7; reg++) {
		movem_handlers += "		if (mask & 1) {" +
"			var value = rl(address);" +
"			address += 4;" +
"			a" + reg + "= value;" +
"		}" +
"		mask >>>= 1;";
	}
	movem_handlers += "	}" +
"}";

// load_multiple_postinc
	movem_handlers += "function load_multiple_postinc(address, mask, size)" +
"{" +
"	if (size == 1) {";
	for (reg = 0; reg <= 7; reg++) {
		movem_handlers += "		if (mask & 1) {" +
"			var value = ewl(rw(address));" +
"			address += 2;" +
"			d" + reg + "= + value;" +
"		}" +
"		mask >>>= 1;";
	}
	for (reg = 0; reg <= 3; reg++) {
		movem_handlers += "		if (mask & 1) {" +
"			var value = ewl(rw(address));" +
"			address += 2;" +
"			a" + reg + "= + value;" +
"		}" +
"		mask >>>= 1;";
	}
	movem_handlers += "if (!mask) return address;";
	for (reg = 4; reg <= 7; reg++) {
		movem_handlers += "		if (mask & 1) {" +
"			var value = ewl(rw(address));" +
"			address += 2;" +
"			a" + reg + "= + value;" +
"		}" +
"		mask >>>= 1;";
	}
	movem_handlers += "	}" +
"	else {";
	for (reg = 0; reg <= 7; reg++) {
		movem_handlers += "		if (mask & 1) {" +
"			var value = rl(address);" +
"			address += 4;" +
"			d" + reg + "= value;" +
"		}" +
"		mask >>>= 1;";
	}
	for (reg = 0; reg <= 3; reg++) {
		movem_handlers += "		if (mask & 1) {" +
"			var value = rl(address);" +
"			address += 4;" +
"			a" + reg + "= + value;" +
"		}" +
"		mask >>>= 1;";
	}
	movem_handlers += "if (!mask) return address;";
	for (reg = 4; reg <= 7; reg++) {
		movem_handlers += "		if (mask & 1) {" +
"			var value = rl(address);" +
"			address += 4;" +
"			a" + reg + "= + value;" +
"		}" +
"		mask >>>= 1;";
	}
	movem_handlers += "	}" +
"	return address;" +
"}";

//console.log(movem_handlers);
}
build_movem_handlers();
eval(movem_handlers);

// Most frequently used functions, according to profiling AMS 2.03 on Firefox Nightly on 2013/07/08.
/*console.log("19679\t" + n[19679]);
console.log("19694\t" +n[19694]);
console.log("18663\t" +n[18663]);
console.log("2050\t" +n[2050]);
console.log("20083\t" +n[20083]);
console.log("28672\t" +n[28672]);
console.log("4604\t" +n[4604]);
console.log("12840\t" +n[12840]);
console.log("20085\t" +n[20085]);
console.log("20936\t" +n[20936]);
console.log("45672\t" +n[45672]);
console.log("26368\t" +n[26368]);
console.log("26112\t" +n[26112]);
console.log("20153\t" +n[20153]);
console.log("8828\t" +n[8828]);
console.log("58760\t" +n[58760]);
console.log("20154\t" +n[20154]);
console.log("13329\t" +n[13329]);
console.log("16952\t" +n[16952]);
console.log("2048\t" +n[2048]);
console.log("8316\t" +n[8316]);
console.log("12306\t" +n[12306]);
console.log("18172\t" +n[18172]);*/

function initemu()
{
	sr = 0;
	if (!checkemu()) {
		console.log("Emulation checks failed");
		return;
	}

	if (!detect_calculator_model()) {
		console.log("Couldn't detect calculator model");
		return;
	}

	ui.setCalculatorModel(calculator_model);
	ui.initscreen();
	ui.initemu();

	initialize_calculator();
	interval = stdlib.setInterval(emu_main_loop, 11);

	for (var key = 0; key < 80; key++) keystatus[key] = 0;

	ui.initkeyhandlers();
};

function setKey(keynumber, status)
{
	// FIXME: this is simple, better than nothing but wrong.
	var prev = keystatus[keynumber];
	keystatus[keynumber] = status;
	if (!prev && status) {
		fire_cpu_exception(26); // AUTO_INT_2
	}
}

function setONKeyPressed(keynumber)
{
	port_60001A = 0x00;
	fire_cpu_exception(30); // AUTO_INT_6
}

function setONKeyReleased(keynumber)
{
	port_60001A = 0x02;
}

// Detecting the calculator model in a generic way is harder than it could seem.
// There are many special cases, and here, we can't rely on libtifiles preparing the work for us...
// In TIEmu, see src/core/images.c::ti68k_get_rom_infos() and src/core/hwpm.c::ti68k_get_hw_param_block().
function detect_calculator_model()
{
	jmp_tbl = rom[(0x12088 + 0xC8) >>> 1] * 65536 + rom[((0x12088 + 0xC8) >>> 1) + 1]; // Jump table, if any
	pedrom = (rom[(0x12088 + 0x32) >>> 1] == 0x524F); // PedroM has kernel type "RO", AMS and Punix have no kernel type.
	punix = (jmp_tbl == 0); // Punix doesn't have an AMS-style jump table.
	var OSsize;

	switch (rom[0x12000 >>> 1]) {
		case 0x800F: // Size on 4 bytes
		{
			OSsize = rom[0x12002 >>> 1] * 65536 + rom[0x12004 >>> 1];
			if (rom[0x12006 >>> 1] == 0x8011) { // Calculator model
				calculator_model = (rom[0x12008 >>> 1] & 0xFF00) >>> 8;
			}
			else {
				console.log("Unhandled calculator model scheme or invalid data");
				return false;
			}
			break;
		}
		case 0x800E: // Size on 2 bytes
		{
			OSsize = rom[0x12002 >>> 1];
			if (rom[0x12004 >>> 1] == 0x8011) { // Calculator model
				calculator_model = (rom[0x12006 >>> 1] & 0xFF00) >>> 8;
			}
			else {
				console.log("Unhandled calculator model scheme or invalid data");
				return false;
			}
			break;
		}
		default: // Probably invalid data, since valid OS upgrades are unlikely to have less than 256 bytes of code+data.
		{
			console.log("Unhandled OS size scheme or invalid data");
			return false;
		}
	}
	//console.log("OS size is " + OSsize + " bytes (+ header and signature)");

	switch (calculator_model) {
		case 1: ROM_base = 0x400000; FlashMemorySize = 0x200000; break; // 92+
		case 3: ROM_base = 0x200000; FlashMemorySize = 0x200000; break; // 89
		case 8: ROM_base = 0x200000; FlashMemorySize = 0x400000; break; // V200
		case 9: ROM_base = 0x800000; FlashMemorySize = 0x400000; break; // 89T
		default: return false;
	}

	// Post-process hardware model from the information contained in HWPB, if any.
	var hwpbaddress = rom[0x104 / 2] * 65536 + rom[0x106 / 2]; // Address of HWPB, if any.
	if (hwpbaddress != 0xFFFFFFFF) {
		// There's a HWPB in this image.
		var hwpboffset = (hwpbaddress - ROM_base) >>> 1;
		var hwpbsize = rom[hwpboffset]; // Read size bytes.
		//console.log("hwpbaddress=" + to_hex(hwpbaddress, 6) + " hwpboffset=" + to_hex(hwpboffset, 6) + " hwpbsize=" + to_hex(hwpbsize, 4));
		if (hwpbsize >= 6) {
			// There's a hardware ID field in this HWPB.
			calculator_model = rom[hwpboffset + 1] * 65536 + rom[hwpboffset + 2];
			console.log("calculator_model=" + calculator_model);
			if (calculator_model == 8 && ROM_base == 0x400000) {
				console.log("Detected V200 ROM patched as 92+, forcing 92+ model");
				calculator_model = 1; FlashMemorySize = 0x200000;
			}
			else if (calculator_model == 9 && ROM_base == 0x200000) {
				console.log("Detected 89T ROM patched as 89, forcing 89 model");
				calculator_model = 3; FlashMemorySize = 0x200000;
			}
		}

		if (hwpbsize >= 0x18) {
			// There's a gate array field in this HWPB.
			hardware_model = rom[hwpboffset + 11] * 65536 + rom[hwpboffset + 12];
		}
		else {
			hardware_model = (calculator_model == 9) ? 3 : ((calculator_model == 8) ? 2 : 1); // Assume HW3 for 89T, HW2 for V200 (always correct), HW1 for 89 & 92+.
		}
	}

	console.log("Detected a supported OS, calculator model is " + calculator_model + ", hardware model is " + hardware_model);
	return true;
}

function initialize_calculator()
{
	reset_calculator();

	reset(); // run code from v4sav to skip ahead
}

function reset_calculator()
{
	for (var b = 0; b < 131072; b++)
		ram[b] = 0;

	ui.reset();

	// start here to skip the boot code (which is missing in TIB based images)

	for (var i = 0; i < 128; i++) ram[i] = rom[i + 0x12088 / 2];

	// Redefine memory read / write functions
	if (calculator_model == 1) { // 92+
		rb = rb_1_normal; rw = rw_1_normal; wb = wb_1_normal; ww = ww_1_normal;
	}
	else if (calculator_model == 3) { // 89
		rb = rb_3_normal; rw = rw_3_normal; wb = wb_3_normal; ww = ww_3_normal;
	}
	else if (calculator_model == 8) { // V200
		rb = rb_8_normal; rw = rw_8_normal; wb = wb_8_normal; ww = ww_8_normal;
	}
	else if (calculator_model == 9) { // 89T
		rb = rb_9_normal; rw = rw_9_normal; wb = wb_9_normal; ww = ww_9_normal;
	}
	else {
		console.log("Invalid calculator type");
	}

	pc = ROM_base+0x12188;
	sr = 0x2700;

	link_incoming_queue = new Array();
	link_outgoing_queue = new Array();
}

function fire_cpu_exception(e)
{
	if (stopped)
	{
		// these always resume
		if (e == 31 || e == 30) {
			console.log("Resuming from stop due to AUTO_INT_6 or AUTO_INT_7");
			stopped = false;
			// Return immediately, to prevent the emulator from failing to wake up from power off code executed at SR = 2700.
			return;
		}
		// these only resume if the right bit is set
		if (e >= 25 && e <= 29 && (wakemask & (1 << e - 25))) stopped = false;
	}
	if (stopped) return;

	// skip auto interrupt if current level too high
	if (e >= 25 && e <= 30)
	{
		var interrupt_level = e - 24;
		var current_level = (sr & 0x700) >> 8;
		if (current_level >= interrupt_level) 
		{
			return;
		}
	}

	var oldsr = sr;
	update_sr(sr | 0x2000);

	if (e == 2 || e == 3) a7 -= 8; // for address error and bus error, reserve more stack space
	a7 -= 4; // push pc on supervisor stack
	wl(a7, pc);
	a7 -= 2; // push sr on supervisor stack
	ww(a7, oldsr);
	pc = rl(e * 4); // load new PC from vector table

	// set interrupt level for auto interrupt
	if (e >= 25 && e <= 31) {
		sr &= 0xF8FF;
		var new_level = (e - 24);
		sr += new_level * 256;
	}
}

function dump_incoming_queue(header)
{
	var dump = header;
	for (var y = 0; y < link_incoming_queue.length; y++)
	{
		if (typeof(link_incoming_queue[y]) == "number") {
			dump += to_hex(link_incoming_queue[y], 2) + " ";
		}
		else {
			dump += link_incoming_queue[y] + " ";
		}
	}
	console.log(dump);
}

function dump_outgoing_queue(header)
{
	var dump = header;
	for (var y = 0; y < link_outgoing_queue.length; y++)
	{
		if (typeof(link_outgoing_queue[y]) == "number") {
			dump += to_hex(link_outgoing_queue[y], 2) + " ";
		}
		else {
			dump += link_outgoing_queue[y] + " ";
		}
	}
	console.log(dump);
}

function sendfile(varname, vartype, buf, data_len, offset, write_both_checksum_and_length)
{
	// Initial RTS.
	// libticalcs: dbus_send (target + cmd), called by ti89_send_RTS.
	//                PC_TI92p  CMD_RTS
	link_incoming_queue.push(8, 0xC9); // standard variable header

	var header_len = varname.length + 6 + 1;
	var data_len_full = data_len;

	if (write_both_checksum_and_length) {
		data_len_full += 2;
	}

	// libticalcs: dbus_send (length).
	link_incoming_queue.push(header_len, 0); // header length, little endian to calc
	// libticalcs: ti89_send_RTS.
	link_incoming_queue.push(data_len_full % 256, (data_len_full >>> 8) & 0xFF, (data_len_full >>> 16) & 0xFF, (data_len_full >>> 24) & 0xFF); // data length, little endian to calc
	link_incoming_queue.push(vartype); // variable type
	link_incoming_queue.push(varname.length);

	// libticalcs: dbus_send (checksum computation) on the sole data after the 4 first bytes.
	var header_checksum = varname.length + vartype + (data_len_full % 256) + ((data_len_full >>> 8) & 0xFF) + ((data_len_full >>> 16) & 0xFF) + ((data_len_full >>> 24) & 0xFF);
	for (var x = 0; x < varname.length; x++)
	{
		link_incoming_queue.push(varname[x]);
		header_checksum += varname[x];
	}
	link_incoming_queue.push(0);

	// libticalcs: dbus_send (sum).
	link_incoming_queue.push(header_checksum % 256, header_checksum >>> 8); // header checksum, little endian to calc

	// Loop until all chunks have been queued.
	do {
		var chunk_len = Math.min(65536, data_len);

		// Equivalent of libticalcs: ti89_recv_ACK.
		link_incoming_queue.push('WAIT_ACK');
		// Equivalent of libticalcs: ti89_recv_CTS.
		link_incoming_queue.push('WAIT_CTS');
		// libticalcs: ti89_send_ACK.
		//                PC_TI92p  CMD_ACK
		link_incoming_queue.push(8, 0x56, 0, 0); // ACK packet (for calc's CTS)

		var data_section_len = chunk_len;
		if (write_both_checksum_and_length) {
			data_section_len += 6; // 4 length bytes + 2 checksum bytes
		}
		// libticalcs: ti89_send_XDP
		//                PC_TI92p  CMD_XDP
		link_incoming_queue.push(8, 0x15);

		var data_checksum = 0;

		link_incoming_queue.push(data_section_len % 256, data_section_len >>> 8); // length, little endian to calc
		if (write_both_checksum_and_length) {
			link_incoming_queue.push(0, 0, 0, 0);
			link_incoming_queue.push((chunk_len >>> 8) & 0xFF, chunk_len % 256);
			data_checksum = (chunk_len % 256) + ((chunk_len >>> 8) & 0xFF);
		}

		for (var x = offset; x < offset + chunk_len; x++)
		{
			link_incoming_queue.push(buf[x]);
			data_checksum += buf[x];
		}
		link_incoming_queue.push(data_checksum % 256, (data_checksum >>> 8) % 256); // data checksum, little endian to calc

		// Equivalent of libticalcs: ti89_recv_ACK.
		link_incoming_queue.push('WAIT_ACK');

		if (chunk_len == 65536) {
			// libticalcs: ti89_send_CNT.
			//                PC_TI92p  CMD_CNT
			link_incoming_queue.push(8, 0x78, 0, 0);
			offset += 65536;
			data_len -= 65536;
		}
		else {
			// libticalcs: ti89_send_EOT.
			//                PC_TI92p  CMD_EOT
			link_incoming_queue.push(8, 0x92, 0, 0);
		}

	} while (chunk_len != data_len);

	// Wait for final ACK.
	// Equivalent of libticalcs: ti89_recv_ACK.
	link_incoming_queue.push('WAIT_ACK');

	console.log("finished processing for sending variable");

	dump_incoming_queue("Incoming: " + link_incoming_queue.length + " (pseudo-)bytes\n");
}

// This code was moved out to an external function, so that it can be called multiple times, in order to retrigger reception of one chunk.
function recvfile_requestchunk()
{
	// libticalcs: ti89_send_ACK.
	//                PC_TI92p  CMD_ACK
	link_incoming_queue.push(8, 0x56, 0, 0); // ACK packet (for calc's VAR)

	// libticalcs: ti89_send_CTS.
	//                PC_TI92p  CMD_CTS
	link_incoming_queue.push(8, 0x09, 0, 0); // CTS packet

	// Equivalent of libticalcs: ti89_recv_ACK.
	link_incoming_queue.push('WAIT_ACK');

	// Equivalent of libticalcs: ti89_recv_ACK.
	link_incoming_queue.push('WAIT_XDP');

	// libticalcs: ti89_send_ACK.
	//                PC_TI92p  CMD_ACK
	link_incoming_queue.push(8, 0x56, 0, 0); // ACK packet (for calc's XDP)

	// Equivalent of libticalcs: ti89_recv_CNT. If EOT is received instead of CNT, we have reached the end of the transfer.
	link_incoming_queue.push('WAIT_CNT');
}

// BROKEN !
// For vartype, see http://debrouxl.github.io/gcc4ti/link.html#LIO_CTX and libtifiles:types89.c.
function recvfile(varname, vartype)
{
	link_recv_varsize = 0;
	link_recv_vartype = 0;
	link_recv_varname = "";
	link_recv_foldername = "";
	link_recv_filedata = new Array();

	// If varname is a string, let's convert it into an array of numbers.
	if (typeof(varname) == "string") {
		var bytes = new Array();
		for (var i = 0; i < varname.length; ++i) {
			bytes.push(varname.charCodeAt(i) & 0xFF);
		}
		varname = bytes;
	}

	// Initial REQ.
	// libticalcs: dbus_send (target + cmd), called by ti89_send_REQ.
	//                PC_TI92p  CMD_REQ
	link_incoming_queue.push(8, 0xA2); // standard variable header

	var header_len = varname.length + 6; // No +1 this time, according to libticalcs: ti89_send_REQ.

	// libticalcs: dbus_send (length).
	link_incoming_queue.push(header_len, 0); // header length, little endian to calc
	// libticalcs: ti89_send_REQ.
	link_incoming_queue.push(0, 0, 0, 0); // data length = 0
	link_incoming_queue.push(vartype); // variable type
	link_incoming_queue.push(varname.length);

	// libticalcs: dbus_send (checksum computation) on the sole data after the 4 first bytes.
	var header_checksum = varname.length + vartype;
	for (var x = 0; x < varname.length; x++)
	{
		link_incoming_queue.push(varname[x]);
		header_checksum += varname[x];
	}

	// libticalcs: dbus_send (sum).
	link_incoming_queue.push(header_checksum % 256, header_checksum >>> 8); // header checksum, little endian to calc

	// Equivalent of libticalcs: ti89_recv_ACK.
	link_incoming_queue.push('WAIT_ACK');
	// Equivalent of libticalcs: ti89_recv_VAR.
	link_incoming_queue.push('WAIT_VAR');

	// At first, this code was written as do { [the contents of recvfile_requestchunk()] } while (link_recv_loop_again); [push final ACK]
	// However, recvfile_requestchunk() finished long before the emulated calculator had a chance to send data, and as a consequence,
	// long before the linking emulation code had a chance to set link_recv_loop_again to true.
	// The only thing we can do is queue transfer for the first chunk, and when we have received it:
	// * if the calculator sends a CNT packet, queue transfer for the next chunk;
	// * if the calculator sends an EOT packet, send final ACK.
	recvfile_requestchunk();

	console.log("finished processing for receiving variable (first chunk)");

	dump_incoming_queue("Incoming: " + link_incoming_queue.length + " (pseudo-)bytes\n");
}

// Extracted out of main_loop to help profiling.
function timer_interrupts()
{
	osc2_counter += 128; // XXX 32

	if (osc2_counter >= 0x1000000) osc2_counter -= 0x1000000;

	// check master interrupt control
	if ((interrupt_control & 0x80) == 0)
	{
		// Trigger level 1 interrupt
		if ((osc2_counter & 0x7FF) == 0)
			fire_cpu_exception(25); // AUTO_INT_1

		// Trigger level 3 interrupt
		if ((osc2_counter & 0x7FFFF) == 0 && (interrupt_control & 4))
			fire_cpu_exception(27); // AUTO_INT_3

		// Programmable timer
		if (((osc2_counter % interrupt_rate) == 0) && (interrupt_control & 8))
		{
			if (timer_current == 0)
				timer_current = timer_min;
			else
				timer_current++;
			if (timer_current >= 256)
			{
				timer_current = 0;
				fire_cpu_exception(29); // AUTO_INT_5
			}
		}
	}
};

function link_reset_state(packettype)
{
	console.log("Receiving " + packettype + " failed, resetting link state !");
	link_incoming_queue = new Array();
	link_outgoing_queue = new Array();
	fire_cpu_exception(30); // AUTO_INT_6
	link_recv_varsize = 0;
	link_recv_vartype = 0
	link_recv_varname = "";
	link_recv_foldername = "";
	link_recv_filedata = new Array();
}

// For vartype, see http://debrouxl.github.io/gcc4ti/link.html#LIO_CTX and libtifiles:types89.c.
function link_magic_number()
{
	if (link_recv_vartype >= 35) return "**TIFL**"; // (OS) FlashApp (Certificate)

	if (calculator_model == 1 || calculator_model == 9) return "**TI89**";
	else return "**TI92P*";
}

// Simplified version of libtifiles: ti9x_file_write_regular.
function link_build_output_file()
{
	/*var dump = "";
	for (var y = 0; y < link_recv_filedata.length; y++)
	{
		dump += to_hex(link_recv_filedata[y], 2) + " ";
	}
	console.log(dump);*/

	// 1) Magic number (8 bytes)
	var output_file = new Array();
	var magic = link_magic_number();
	for (var i = 0; i < magic.length; i++) {
		output_file.push(magic.charCodeAt(i));
	}

	// 2) 2 additional bytes (maybe file format revision, but TI never used more than one ?).
	output_file.push(0x01);
	output_file.push(0x00);

	// 3) Folder name, if any (up to 8 chars)
	link_recv_foldername = "main";
	var separatoroffset = link_recv_varname.indexOf("\\");

	if (separatoroffset != -1) {
		link_recv_foldername = link_recv_varname.substr(0, Math.min(separatoroffset, 8-1));
		link_recv_varname = link_recv_varname.substr(separatoroffset + 1);
		if (link_recv_varname.length > 8) {
			console.log("Invalid varname, clamping to 8 characters");
			link_recv_varname = link_recv_varname.substr(0, 7);
		}
	}
	for (var i = 0; i < link_recv_foldername.length; i++) {
		output_file.push(link_recv_foldername.charCodeAt(i));
	}
	// Pad to 8 chars with 0x00.
	for (var i = 8 - link_recv_foldername.length; i > 0; i--) {
		output_file.push(0);
	}

	// 4) 40 x 0x00.
	for (var i = 0; i < 40; i++) {
		output_file.push(0);
	}

	// 5) A single entry in this file.
	output_file.push(0x01);
	output_file.push(0x00);

	// 6) Offset of data in file (can be hard-coded to 0x52 in this case).
	output_file.push(0x52);
	output_file.push(0x00);
	output_file.push(0x00);
	output_file.push(0x00);

	// 7) Variable name
	for (var i = 0; i < link_recv_varname.length; i++) {
		output_file.push(link_recv_varname.charCodeAt(i));
	}
	// Pad to 8 chars with 0x00.
	for (var i = 8 - link_recv_varname.length; i > 0; i--) {
		output_file.push(0);
	}

	// 8) Variable type
	output_file.push(link_recv_vartype);

	// 9) Variable attribute (archived and friends)
	// Hard-code unarchived and unlocked, as the variable attribute information is not available in the packet sequence (we'd need to implement dirlist for that).
	output_file.push(0x00);

	// 10) 2 x 0x00
	output_file.push(0x00);
	output_file.push(0x00);

	// 11) Total size of file on the computer side (including checksum)
	var varsize = link_recv_varsize + 0x52 + 4 + 2;
	output_file.push(varsize & 0xFF);
	output_file.push((varsize >>> 8) & 0xFF);
	output_file.push((varsize >>> 16) & 0xFF);
	output_file.push((varsize >>> 24) & 0xFF);

	// 12) Marker
	output_file.push(0xA5);
	output_file.push(0x5A);

	// 13) 4 x 0x00
	output_file.push(0x00);
	output_file.push(0x00);
	output_file.push(0x00);
	output_file.push(0x00);

	// 14) Data (at last :P)
	var checksum = 0;
	for (var i = 0; i < link_recv_filedata.length; i++) {
		output_file.push(link_recv_filedata[i]);
		checksum += link_recv_filedata[i];
	}

	// 15) Checksum
	output_file.push(checksum & 0xFF);
	output_file.push((checksum >>> 8) & 0xFF);

	// Finally, replace file data.
	link_recv_filedata = new Uint8Array(output_file);
}

// Extracted out of main_loop to help profiling.
function link_handling()
{
	if (((link_config & 5) && link_incoming_queue.length > 0 && typeof(link_incoming_queue[0]) == "number") ||
		(link_config & 6))
	{
		fire_cpu_exception(28); // AUTO_INT_4
	}
	
	if (link_incoming_queue.length > 0)
	{
		if (link_incoming_queue[0] == 'WAIT_ACK')
		{
			//console.log("Begin WAIT_ACK, outgoing queue length:", link_outgoing_queue.length);
			for (var x = 0; x + 4 <= link_outgoing_queue.length; x++)
			{
				//                                TI92p_PC / V200_PC                  CMD_ACK
				if (   (link_outgoing_queue[x] == 0x88 && link_outgoing_queue[x+1] == 0x56)
				//                                TI89_PC / TI89t_PC                  CMD_ACK
				    || (link_outgoing_queue[x] == 0x98 && link_outgoing_queue[x+1] == 0x56))
				{
					// libticalcs: ti89_recv_ACK indicates that length can be nonzero for failure
					// FIXME: better error handling !
					if (link_outgoing_queue[x+2] != 0 || link_outgoing_queue[x+3] != 0) {
						link_reset_state("ACK");
					}
					else {
						dump_outgoing_queue("WAIT_ACK Before: ");

						link_outgoing_queue.splice(x, x+4);
						link_incoming_queue.shift();
						console.log("Eaten an item in WAIT_ACK", x);

						dump_outgoing_queue("After: ");
					}
				}
			}
			//console.log("End WAIT_ACK, outgoing queue length:", link_outgoing_queue.length);
		}
		else if (link_incoming_queue[0] == 'WAIT_CTS')
		{
			//console.log("Begin WAIT_CTS, outgoing queue length:", link_outgoing_queue.length);
			for (var x = 0; x + 4 <= link_outgoing_queue.length; x++)
			{
				//                                TI92p_PC / V200_PC                  CMD_CTS
				if (   (link_outgoing_queue[x] == 0x88 && link_outgoing_queue[x+1] == 0x09)
				//                                TI89_PC / TI89t_PC                  CMD_CTS
				    || (link_outgoing_queue[x] == 0x98 && link_outgoing_queue[x+1] == 0x09))
				{
					// libticalcs: ti89_recv_CTS indicates that length can be nonzero for failure
					// FIXME: better error handling !
					if (link_outgoing_queue[x+2] != 0 || link_outgoing_queue[x+3] != 0) {
						link_reset_state("CTS");
					}
					else {
						dump_outgoing_queue("WAIT_CTS Before: ");

						link_outgoing_queue.splice(0, x+4);
						link_incoming_queue.shift();
						console.log("Eaten an item in WAIT_CTS", x);

						dump_outgoing_queue("After: ");
					}
				}
			}
			//console.log("End WAIT_CTS, outgoing queue length:", link_outgoing_queue.length);
		}
		else if (link_incoming_queue[0] == 'WAIT_VAR')
		{
			// WIP
			//console.log("Begin WAIT_VAR, outgoing queue length:", link_outgoing_queue.length);
			for (var x = 0; x + 4 <= link_outgoing_queue.length; x++)
			{
				//                                TI92p_PC / V200_PC                  CMD_VAR
				if (   (link_outgoing_queue[x] == 0x88 && link_outgoing_queue[x+1] == 0x06)
				//                                TI89_PC / TI89t_PC                  CMD_VAR
				    || (link_outgoing_queue[x] == 0x98 && link_outgoing_queue[x+1] == 0x06))
				{
					// TODO: error handling
					var length = link_outgoing_queue[x+2] + link_outgoing_queue[x+3] * 256;
					dump_outgoing_queue("WAIT_VAR Before: ");

					// Skip 4-byte header.
					link_outgoing_queue.splice(0, x+4); // 2 checksum bytes
					link_incoming_queue.shift();
					console.log("Eaten an item in WAIT_VAR", x);

					dump_outgoing_queue("After: ");
				}
			}
			//console.log("End WAIT_VAR, outgoing queue length:", link_outgoing_queue.length);
		}
		else if (link_incoming_queue[0] == 'WAIT_XDP')
		{
			// WIP
			//console.log("Begin WAIT_XDP, outgoing queue length:", link_outgoing_queue.length);
			for (var x = 0; x + 4 <= link_outgoing_queue.length; x++)
			{
				//                                TI92p_PC / V200_PC                  CMD_XDP
				if (   (link_outgoing_queue[x] == 0x88 && link_outgoing_queue[x+1] == 0x15)
				//                                TI89_PC / TI89t_PC                  CMD_XDP
				    || (link_outgoing_queue[x] == 0x98 && link_outgoing_queue[x+1] == 0x15))
				{
					// TODO: error handling
					var length = link_outgoing_queue[x+2] + link_outgoing_queue[x+3] * 256;
					dump_outgoing_queue("WAIT_XDP Before: ");

					// Process contents of VAR packet, now that it was received entirely (libticalcs: ti89_recv_VAR).
					var computed_checksum = link_outgoing_queue[0] + link_outgoing_queue[1] + link_outgoing_queue[2] + link_outgoing_queue[3]; // varsize
					link_recv_varsize = link_outgoing_queue[0] + link_outgoing_queue[1] * 256 + link_outgoing_queue[2] * 65536 + link_outgoing_queue[3] * 16777216;
					link_recv_vartype = link_outgoing_queue[4];
					computed_checksum += link_outgoing_queue[4] + link_outgoing_queue[5]; // vartype + strl
					var strl = link_outgoing_queue[5];
					for (var i = 0; i < strl; i++) {
						link_recv_varname += String.fromCharCode(link_outgoing_queue[6+i]);
						computed_checksum += link_outgoing_queue[6+i];
					}
					console.log("link_recv_varsize = " + link_recv_varsize);
					console.log("link_recv_vartype = " + link_recv_vartype);
					console.log("strl = " + strl);
					console.log("link_recv_varname = " + link_recv_varname);

					link_recv_filedata = new Uint8Array(link_recv_varsize);
					var packet_checksum = link_outgoing_queue[x-2] + link_outgoing_queue[x-1] * 256;
					if ((computed_checksum & 0xFFFF) != packet_checksum) {
						console.log("WAIT_XDP: Wrong checksum: computed=" + to_hex(computed_checksum, 4) + " packet=" + to_hex(packet_checksum, 4) + "!");
					}

					// Skip what we processed.
					link_outgoing_queue.splice(0, x+4);
					link_incoming_queue.shift();
					console.log("Eaten an item in WAIT_XDP", x);

					dump_outgoing_queue("After: ");
				}
			}
			//console.log("End WAIT_XDP, outgoing queue length:", link_outgoing_queue.length);
		}
		else if (link_incoming_queue[0] == 'WAIT_CNT')
		{
			// WIP
			//console.log("Begin WAIT_CNT, outgoing queue length:", link_outgoing_queue.length);
			for (var x = 0; x + 4 <= link_outgoing_queue.length; x++)
			{
				//                                TI92p_PC / V200_PC                  CMD_CNT
				if (   (link_outgoing_queue[x] == 0x88 && link_outgoing_queue[x+1] == 0x78)
				//                                TI89_PC / TI89t_PC                  CMD_CNT
				    || (link_outgoing_queue[x] == 0x98 && link_outgoing_queue[x+1] == 0x78)
				//                                TI92p_PC / V200_PC                  CMD_EOT
				    || (link_outgoing_queue[x] == 0x88 && link_outgoing_queue[x+1] == 0x92)
				//                                TI89_PC / TI89t_PC                  CMD_EOT
				    || (link_outgoing_queue[x] == 0x98 && link_outgoing_queue[x+1] == 0x92))
				{
					// TODO: error handling
					dump_outgoing_queue("WAIT_CNT Before: ");
					var packet_type = link_outgoing_queue[x+1];

					// Process contents of XDP packet, now that it was received entirely (libticalcs: ti89_recv_XDP + clients): build output file.
					// Skip 4 first bytes.
					var computed_checksum = 0;
					for (var i = 4; i < link_recv_varsize + 4; i++) {
						link_recv_filedata[i-4] = link_outgoing_queue[i];
						computed_checksum += link_outgoing_queue[i];
					}

					var packet_checksum = link_outgoing_queue[x-2] + link_outgoing_queue[x-1] * 256;
					if ((computed_checksum & 0xFFFF) != packet_checksum) {
						console.log("WAIT_CNT: Wrong checksum: computed=" + to_hex(computed_checksum, 4) + " packet=" + to_hex(packet_checksum, 4) + "!");
					}

					console.log("link_recv_filedata has length " + link_recv_filedata.length);

					link_outgoing_queue.splice(0, x+4);
					link_incoming_queue.shift();
					console.log("Eaten an item in WAIT_CNT", x);

					if (packet_type == 0x92) {
						// EOT, we'll be able to create the target file.

						// Push final ACK, so that transfer terminates on the calculator side.
						// libticalcs: ti89_send_ACK.
						//                PC_TI92p  CMD_ACK
						link_incoming_queue.push(8, 0x56, 0, 0); // ACK packet (for calc's XDP)

						// Create the target file.
						link_build_output_file();
					}
					else {
						recvfile_requestchunk(); // CNT, queue transfers for next chunk.
					}

					dump_outgoing_queue("After: ");
				}
			}
			//console.log("End WAIT_CNT, outgoing queue length:", link_outgoing_queue.length);
		}
	}
};

function execute_instructions(number)
{
	for (var inner = 0; inner < number; inner++) {
		var opcode = rw(pc);
		if (tracecount > 0) {
			tracecount--;
			if (overall > 0) {
				overall--;
				print_status();
			}
		}
		pc += 2;

		t[opcode]();
	}
}

function emu_main_loop()
{
	if (unhandled_count >= 10) return;

	var starttime = (new Date).getTime();
	var started = false;

	// The cost of exception handling is noticeable. For most of the emulator's operation, it can, in fact, be removed.
	try {
		// The LCD refreshes every 8192 OSC2 cycles (by default)
		for (var outer = 0; outer < (256 - screen_height) * 2 /*&& unhandled_count < 10*/; outer++)
		{
			// Assume we can run 2 instructions per OSC2 cycle, so 64 instructions between programmable interrupt counts (every 32 cycles).
			// We get about 744khz OSC2 rate here, which comes out to around 1.49 million instructions per second, 
			// which is fairly reasonable depending on your instruction mix.
			if (!stopped)
			{
				execute_instructions(64);
			}

			// check if osc2 enabled
			if (interrupt_control & 2)
			{
				timer_interrupts();
			}

			// link interrupts
			link_handling();
		}

	} catch (e) {
		if (e == "STOP")
		{
			stopped = true;
			//console.log("stopped at " + to_hex(pc,9) + " SR = " + to_hex(sr,5));
		}
		else if (isNaN(e) || e < 0 || e > 255 || e != Math.floor(e))
		{
			// this is a real javascript exception
			console.log("real javascript exception " + e);
			console.log(e.stack);
			stdlib.clearInterval(interval);
			return;
		}
	}

	ui.draw_screen((lcd_address_low + (lcd_address_high << 8)) << 2, ram);

	var endtime = (new Date).getTime();

	total_time += (endtime - starttime);
	frames_counted++;

	if (frames_counted == 1000)
	{
		document.title = "Average milliseconds for the last 1000 frames is " + (total_time/1000);
		total_time = frames_counted = 0;
	}

	if (newromready)
	{
		var inputrom = newromready.result;
		newromready = false;
		var buf = new Uint8Array(inputrom);
		if (inputrom.byteLength == 0x200000 || inputrom.byteLength == 0x400000)
		{
			console.log("Processing plain ROM image");
			rom = new Uint16Array(inputrom.byteLength / 2);
			for (var x = 0; x < inputrom.byteLength; x += 2)
			{
				rom[x / 2] = buf[x] * 256 + buf[x + 1];
			}
			initemu();
		}
		else
		{
			console.log("Processing TIB/9XU image");
			var start = 0;
			if (buf[0] == 0x2A && buf[1] == 0x2A && buf[2] == 0x54 && buf[3] == 0x49 && buf[4] == 0x46 && buf[5] == 0x4C && buf[6] == 0x2A && buf[7] == 0x2A)
			{
				for (var test = 0; test < inputrom.byteLength - 8; test++)
				{
					// "basecode"
					if (buf[test] == 0x62 && buf[test+1] == 0x61 && buf[test+2] == 0x73 && buf[test+3] == 0x65 && buf[test+4] == 0x63 && buf[test+5] == 0x6f && buf[test+6] == 0x64 && buf[test+7]== 0x65)
					{
						start = test + 0x3d;
						break;
					}
				}
			}
			console.log("Offset = " + start);

			rom = new Uint16Array(0x400000 / 2); // Allocate an array of maximum size.
			var offset = 0;
			for (offset = 0; offset < 0x12000 / 2; offset++) {
				rom[offset] = 5120;  // 0x1400
			}

			for (var x = start; x < inputrom.byteLength; x += 2)
			{
				rom[offset] = buf[x] * 256 + buf[x + 1];
				offset++;
			}
			while (offset < rom.length) {
				rom[offset] = 0xFFFF;
				offset++;
			}
			initemu();
			rom = rom.subarray(0, FlashMemorySize / 2); // Reduce array size if possible.
			//overall = 150; tracecount = 50;
		}
	}

	if (newfileready)
	{
		var buf;
		if (typeof(newfileready) == "object") { // The contents were loaded from a JS function further down
			buf = new Uint8Array(newfileready.result);
		}
		else if (typeof(newfileready) == "array") { // The contents were stored directly into an array
			buf = newfileready;
		}
		newfileready = false;

		var varname = new Array();
		for (var x = 0x0A; x < 0x12; x++)
		{
			if (buf[x] == 0) break;
			varname.push(buf[x]);
		}
		varname.push(0x5c); // backslash
		for (var x = 0x40; x < 0x48; x++)
		{
			if (buf[x] == 0) break;
			varname.push(buf[x]);
		}

		var vartype = buf[0x48];

		var data_len = buf[0x57] + buf[0x56] * 256;

		sendfile(varname, vartype, buf, data_len, 0x58, true); // Data starts at 0x58
	}

	if (newflashfileready)
	{
		var buf;
		if (typeof(newflashfileready) == "object") { // The contents were loaded from a JS function further down
			buf = new Uint8Array(newflashfileready.result);
		}
		else if (typeof(newflashfileready) == "array") { // The contents were stored directly into an array
			buf = newflashfileready;
		}
		newflashfileready = false;

		var varname = new Array();
		for (var x = 0x11; x < 0x19; x++)
		{
			if (buf[x] == 0) break;
			varname.push(buf[x]);
		}

		var vartype = buf[0x31];

		var data_len = buf[0x4A] + buf[0x4B] * 256 + buf[0x4C] * 65536 + buf[0x4D] * 16777216;

		sendfile(varname, vartype, buf, data_len, 0x4E, false); // data starts at 0x4E
	}
}

function loadrom()
{
	var infile = document.getElementById("romfile").files[0];
	console.log("starting to read file " + infile.name);
	var extension = infile.name.toLowerCase().substr(-4);
	if ((infile.size == 0x200000 || infile.size == 0x400000) && extension == ".rom")
	{
		console.log("Loading as plain ROM");
		var reader = new FileReader();
		reader.onload = function() { newromready = reader; unhandled_count = 0; };
		reader.readAsArrayBuffer(infile);
	}
	if (infile.size >= 1024 && infile.size < 0x200000 && (extension == ".tib" || extension == ".9xu" || extension == ".89u" || extension == ".v2u"))
	{
		console.log("Starting to load as TIB / OS upgrade");
		var reader = new FileReader();
		reader.onload = function() { newromready = reader; unhandled_count = 0; };
		reader.readAsArrayBuffer(infile);
	}
	// tilp: MIME types definition.
	// libtifiles: types89.c.
	if (   infile.size >= 80
	    && infile.size < 70000
	    && (   ".9xa.89a.v2a".indexOf(extension) != -1 // Figure, infrequent
	        // TODO: handle .9xb.89b.v2b (Backup) some day.
	        || ".9xc.89c.v2c".indexOf(extension) != -1 // Data, infrequent
	        || ".9xd.89d.v2d".indexOf(extension) != -1 // GDB, infrequent
	        || ".9xe.89e.v2e".indexOf(extension) != -1 // Expression
	        || ".9xf.89f.v2f".indexOf(extension) != -1 // Function
	        // TODO: handle .9xg.89g.v2g and .tig (Group) some day.
	        || ".9xi.89i.v2i".indexOf(extension) != -1 // Image
	        // .9xk.89k.v2k (FlashApp) handled below.
	        || ".9xl.89l.v2l".indexOf(extension) != -1 // List
	        || ".9xm.89m.v2m".indexOf(extension) != -1 // Matrix
	        // .9xn.89n.v2n ?
	        || ".9xp.89p.v2p".indexOf(extension) != -1 // Program
	        // .9xq.89q.v2q (Certificate) handled below.
	        || ".9xs.89s.v2s".indexOf(extension) != -1 // String
	        || ".9xt.89t.v2t".indexOf(extension) != -1 // Text
	        // .9xu.89u.v2u (OS upgrade) handled above
	        || ".9xx.89x.v2x".indexOf(extension) != -1 // Macro, infrequent
	        || ".9xy.89y.v2y".indexOf(extension) != -1 // Other
	        || ".9xz.89z.v2z".indexOf(extension) != -1 // Assembly program
	       )) {
		console.log("Starting to load as variable");
		var reader = new FileReader();
		reader.onload = function() { newfileready = reader; unhandled_count = 0; };
		reader.readAsArrayBuffer(infile);
	}
	if (   infile.size >= 80
	    && (   ".9xk.89k.v2k".indexOf(extension) != -1 // FlashApp
	        //|| ".9xq.89q.v2q".indexOf(extension) != -1 // Certificate - useless nowadays since we can resign FlashApps
	       )) {
		console.log("Starting to load as Flash variable - WIP");
		var reader = new FileReader();
		reader.onload = function() { newflashfileready = reader; unhandled_count = 0; };
		reader.readAsArrayBuffer(infile);
	}
}

// libtifiles: types89.c
function buildFileExtensionFromVartype()
{
	var prefix = (calculator_model == 1 || calculator_model == 9) ? ".89" : ((calculator_model == 8) ? ".v2" : ".9x");
	var suffix = "";
	switch (link_recv_vartype) {
		case 0:  suffix = "e"; break; // Expression
		case 4:  suffix = "l"; break; // List
		case 6:  suffix = "m"; break; // Matrix
		case 10: suffix = "c"; break; // Data
		case 11: suffix = "t"; break; // Text
		case 12: suffix = "s"; break; // String
		case 13: suffix = "d"; break; // GDB (infrequent)
		case 14: suffix = "a"; break; // Geometry figure (infrequent)
		case 16: suffix = "i"; break; // Picture
		case 18: suffix = "p"; break; // Program
		case 19: suffix = "f"; break; // Function
		case 20: suffix = "x"; break; // Macro (infrequent)
		case 28: suffix = "y"; break; // Other
		//case 29: suffix = "g"; break; // Group
		case 33: suffix = "z"; break; // Assembly program
		//case 35: suffix = "u"; break; // OS Upgrade
		case 36: suffix = "k"; break; // FlashApp
		//case 37: suffix = "q"; break; // Certificate file
		default: suffix = "?"; break;
	}
	return prefix + suffix;
}

function getFileData()
{
	// http://stackoverflow.com/a/16213045
	var blob = new Blob([link_recv_filedata], {type: "application/octet-binary"});
	var url = URL.createObjectURL(blob);
	var a = document.querySelector("#downloadFile");
	a.href = url;
	a.download = link_recv_foldername + "." + link_recv_varname + buildFileExtensionFromVartype();
	a.style.display='inline';
}

function check_subl() {
	var result;

	result = subl(0x12345678, 0x12345678);
	if (result != 0x0 || sr != 4) {
		console.log("subl 0 " + to_hex(sr, 4) + " " + to_hex(result, 16));
		return false;
	}

	result = subl(0x1234567, 0x12345678);
	if (result != 0x11111111 || sr != 0) {
		console.log("subl 1 " + to_hex(sr, 4) + " " + to_hex(result, 16));
		return false;
	}

	result = subl(0x23456789, 0x12345678);
	if (result != 0xEEEEEEEF || sr != 0x19) {
		console.log("subl 2 " + to_hex(sr, 4) + " " + to_hex(result, 16));
		return false;
	}

	result = subl(0x12345678, 0xFF000000);
	if (result != 0xECCBA988 || sr != 0x08) {
		console.log("subl 3 " + to_hex(sr, 4) + " " + to_hex(result, 16));
		return false;
	}

	result = subl(0xFF000000, 0x12345678);
	if (result != 0x13345678 || sr != 0x11) {
		console.log("subl 4 " + to_hex(sr, 4) + " " + to_hex(result, 16));
		return false;
	}

	result = subl(0x7FFFFFFF, 0xFF000000);
	if (result != 0x7F000001 || sr != 0x02) {
		console.log("subl 5 " + to_hex(sr, 4) + " " + to_hex(result, 16));
		return false;
	}

	result = subl(0xFF000018, 0xFF000000);
	if (result != 0xFFFFFFE8 || sr != 0x19) {
		console.log("subl 6 " + to_hex(sr, 4) + " " + to_hex(result, 16));
		return false;
	}

	return true;
}

function check_addl() {
	var result;

	result = addl(0x12345678, 0x12345678);
	if (result != 0x2468ACF0 || sr != 0) {
		console.log("addl 0 " + to_hex(sr, 4) + " " + to_hex(result, 16));
		return false;
	}

	result = addl(0x1234567, 0x12345678);
	if (result != 0x13579BDF || sr != 0) {
		console.log("addl 1 " + to_hex(sr, 4) + " " + to_hex(result, 16));
		return false;
	}

	result = addl(0x23456789, 0x12345678);
	if (result != 0x3579BE01 || sr != 0) {
		console.log("addl 2 " + to_hex(sr, 4) + " " + to_hex(result, 16));
		return false;
	}

	result = addl(0x12345678, 0xFF000000);
	if (result != 0x11345678 || sr != 0x11) {
		console.log("addl 3 " + to_hex(sr, 4) + " " + to_hex(result, 16));
		return false;
	}

	result = addl(0x7FFFFFFF, 0x7FFFFFFF);
	if (result != 0xFFFFFFFE || sr != 0xA) {
		console.log("addl 4 " + to_hex(sr, 4) + " " + to_hex(result, 16));
		return false;
	}

	result = addl(0x7FFFFFFF, 0xFF000000);
	if (result != 0x7EFFFFFF || sr != 0x11) {
		console.log("addl 5 " + to_hex(sr, 4) + " " + to_hex(result, 16));
		return false;
	}

	result = addl(0xFF000018, 0xFF000000);
	if (result != 0xFE000018 || sr != 0x19) {
		console.log("addl 6 " + to_hex(sr, 4) + " " + to_hex(result, 16));
		return false;
	}

	return true;
}

function check_cmpl() {
	var result;

	sr = 0;

	result = cmpl(0x12345678, 0x12345678);
	if (result != 0x0 || sr != 4) {
		console.log("cmpl 0 " + to_hex(sr, 4) + " " + to_hex(result, 16));
		return false;
	}

	result = cmpl(0x1234567, 0x12345678);
	if (result != 0x11111111 || sr != 0) {
		console.log("cmpl 1 " + to_hex(sr, 4) + " " + to_hex(result, 16));
		return false;
	}

	result = cmpl(0x23456789, 0x12345678);
	if (result != 0xEEEEEEEF || sr != 0x09) {
		console.log("cmpl 2 " + to_hex(sr, 4) + " " + to_hex(result, 16));
		return false;
	}

	sr = 0x10; // Force X to 1, so as to check that subsequent cmp don't modify it.

	result = cmpl(0x12345678, 0xFF000000);
	if (result != 0xECCBA988 || sr != 0x18) {
		console.log("cmpl 3 " + to_hex(sr, 4) + " " + to_hex(result, 16));
		return false;
	}

	result = cmpl(0xFF000000, 0x12345678);
	if (result != 0x13345678 || sr != 0x11) {
		console.log("cmpl 4 " + to_hex(sr, 4) + " " + to_hex(result, 16));
		return false;
	}

	result = cmpl(0x7FFFFFFF, 0xFF000000);
	if (result != 0x7F000001 || sr != 0x12) {
		console.log("cmpl 5 " + to_hex(sr, 4) + " " + to_hex(result, 16));
		return false;
	}

	sr = 0; // Force X back to 0.

	result = cmpl(0xFF000018, 0xFF000000);
	if (result != 0xFFFFFFE8 || sr != 0x9) {
		console.log("cmpl 6 " + to_hex(sr, 4) + " " + to_hex(result, 16));
		return false;
	}

	result = cmpl(0xFF000000, 0x320);
	if (sr != 0x1) {
		console.log("cmpl 7 " + to_hex(sr, 4) + " " + to_hex(result, 16));
		return false;
	}

	return true;
}

function check_divu() {
	var result;
	var comparison;

	sr = 0;
	result = divu(0x10, 0x12345678);
	if (result != 0x12345678 || (sr & 3) != 2) {
		console.log("divu 0 " + to_hex(sr, 4) + " " + to_hex(result, 16));
		return false;
	}

	result = divu(0x10, 0xFF000000);
	comparison = 0xFF000000;
	result &= 0xFFFFFFFF;
	comparison &= 0xFFFFFFFF;
	if (result != comparison || (sr & 3) != 2) {
		console.log("divu 1 " + to_hex(sr, 4) + " " + to_hex(result, 16));
		return false;
	}

	result = divu(0xCCCCFFFF, 0xFF000000);
	comparison = 0xFF00FF00;
	result &= 0xFFFFFFFF;
	comparison &= 0xFFFFFFFF;
	if (result != comparison || sr != 0x8) {
		console.log("divu 2 " + to_hex2(result, 9) + " " + to_hex2(comparison, 9) + " " + to_hex(sr, 4) + " " + to_hex(result, 16));
		return false;
	}

	return true;
}

function checkemu() {
	return check_subl()
	    && check_addl()
	    && check_cmpl()
	    && check_divu()
	    ;
};

function setRom(newrom) {
	rom = newrom;
}

function setReset(newreset) {
	reset = newreset;
}

function setUI(newui) {
	ui = newui;
}

function get_d0() { return d0; }
function get_d1() { return d1; }
function get_d2() { return d2; }
function get_d3() { return d3; }
function get_d4() { return d4; }
function get_d5() { return d5; }
function get_d6() { return d6; }
function get_d7() { return d7; }

function get_a0() { return a0; }
function get_a1() { return a1; }
function get_a2() { return a2; }
function get_a3() { return a3; }
function get_a4() { return a4; }
function get_a5() { return a5; }
function get_a6() { return a6; }
function get_a7() { return a7; }
function get_a8() { return a8; }

function get_sr() { return sr; }
function get_pc() { return pc; }

function get_rom() { return rom; }
function get_ram() { return ram; }
function get_t() { return t; }
function get_n() { return n; }

function get_link_incoming_queue() { return link_incoming_queue; }
function get_link_outgoing_queue() { return link_outgoing_queue; }
function get_link_recv_varsize() { return link_recv_varsize; }
function get_link_recv_vartype() { return link_recv_vartype; }
function get_link_recv_varname() { return link_recv_varname; }
function get_link_recv_foldername() { return link_recv_foldername; }
function get_link_recv_filedata() { return link_recv_filedata; }

function get_stopped() { return stopped; }
function get_hardware_model() { return hardware_model; }
function get_calculator_model() { return calculator_model; }
function get_jmp_tbl() { return jmp_tbl; }
function get_ROM_base() { return ROM_base; }
function get_FlashMemorySize() { return FlashMemorySize; }

function pause_emulator()
{
	// Prevent emu_main_loop frop running next time.
	stdlib.clearInterval(interval);
}

function resume_emulator()
{
	// Is that enough ?
	interval = stdlib.setInterval(emu_main_loop, 11);
}

return {
	// Functions called directly from events on elements in the HTML page
	initemu : initemu,
	loadrom : loadrom,
	initialize_calculator : initialize_calculator,
	getFileData : getFileData,

	// Setter functions called by a script in the HTML page, for defining stuff loaded from other files.
	setRom : setRom,
	setReset : setReset,
	setUI : setUI,

	// Setter functions called by the UI.
	setKey : setKey,
	setONKeyPressed : setONKeyPressed,
	setONKeyReleased : setONKeyReleased,
	pause_emulator : pause_emulator,
	resume_emulator : resume_emulator,

	// Debugging, getter functions for internal variables
	emu_main_loop : emu_main_loop,
	print_status : print_status,
	print_status2 : print_status2,
	disassemble : disassemble,
	ROM_CALL : ROM_CALL,
	HeapDeref : HeapDeref,
	HeapSize : HeapSize,
	PrintHeap : PrintHeap,

	d0 : get_d0, d1 : get_d1, d2 : get_d2, d3 : get_d3, d4 : get_d4, d5 : get_d5, d6 : get_d6, d7 : get_d7,
	a0 : get_a0, a1 : get_a1, a2 : get_a2, a3 : get_a3, a4 : get_a4, a5 : get_a5, a6 : get_a6, a7 : get_a7, a8 : get_a8,
	sr : get_sr, pc : get_pc,
	dn : dn, an : an,

	rom : get_rom,
	ram : get_ram,
	t : get_t,
	n : get_n,

	link_incoming_queue : get_link_incoming_queue,
	link_outgoing_queue : get_link_outgoing_queue,
	link_recv_varsize : get_link_recv_varsize,
	link_recv_vartype : get_link_recv_vartype,
	link_recv_varname : get_link_recv_varname,
	link_recv_foldername : get_link_recv_foldername,
	link_recv_filedata : get_link_recv_filedata,

	stopped : get_stopped,
	hardware_model : get_hardware_model,
	calculator_model : get_calculator_model,
	jmp_tbl : get_jmp_tbl,
	ROM_base : get_ROM_base,
	FlashMemorySize : get_FlashMemorySize
};

}

function EmulatorUIModule(stdlib) {

var calcscreen = new Uint8Array(240 * 128 * 3); // stores three frames of pixel data for averaging
var frame = 0;
var emu = false;
var bitmap = false;
var context = false;
var calculator_model = 0;
var set_skin = false;
var screen_scaling_ratio = 2; // 2:1 by default

function draw_calcscreen(address, ram)
{
	var pixel = frame;
	for (var y = 0; y < 128; y++)
		for (var x = 0; x < 15; x++) {
			var b = ram[address++];
			for (var bit = 15; bit >= 0; bit--) {
				var color = b & 0x8000 ? 0 : 0x50;
				b <<= 1;
				calcscreen[pixel] = color;
				pixel += 3;
			}
		}

	frame++;
	if (frame == 3) frame = 0;
};

function output_calcscreen_to_bitmap_scale1()
{
	var pixel = 0;
	var p = 0;
	var buff = bitmap.data;

	for (var y = 0; y < 3840 * 128; y += 3840) {
		for (var x = 0; x < 240; x++) {
			var color = calcscreen[pixel++] + calcscreen[pixel++] + calcscreen[pixel++];
			buff[p] = color;
			buff[p + 1] = color;
			buff[p + 2] = color;
			p+=4;
		}
	}

	context.putImageData(bitmap, 0, 0);
};

function output_calcscreen_to_bitmap_scale2()
{
	var pixel = 0;
	var p = 0;
	var buff = bitmap.data;

	for (var y = 0; y < 3840 * 128; y += 3840) {
		for (var x = 0; x < 240; x++) {
			var color = calcscreen[pixel++] + calcscreen[pixel++] + calcscreen[pixel++];
			buff[p] = color;
			buff[p + 1] = color;
			buff[p + 2] = color;
			buff[p + 4] = color;
			buff[p + 5] = color;
			buff[p + 6] = color;
			buff[p + 1920] = color;
			buff[p + 1921] = color;
			buff[p + 1922] = color;
			buff[p + 1924] = color;
			buff[p + 1925] = color;
			buff[p + 1926] = color;
			p+=8;
		}
		p += 1920;
	}

	context.putImageData(bitmap, 0, 0);
};

// Split the function to help with profiling.
function draw_screen(address, ram)
{
	draw_calcscreen(address, ram);
	if (screen_scaling_ratio == 2) {
		output_calcscreen_to_bitmap_scale2();
	}
	else if (screen_scaling_ratio == 1) {
		output_calcscreen_to_bitmap_scale1();
	}
	// else do nothing.
};

function create_button(shape, coords, keynumber)
{
	var map = document.getElementById('map');
	var area = document.createElement('area');
	area.shape = shape;
	area.coords = coords;
	area.onmousedown = function() { emu.setKey(keynumber, 1); }
	area.ontouchdown = function() { emu.setKey(keynumber, 1); }
	area.onmouseup = function() { emu.setKey(keynumber, 0); }
	area.ontouchup = function() { emu.setKey(keynumber, 0); }
	map.appendChild(area);
}

function create_on_button(shape, coords)
{
	var map = document.getElementById('map');
	var area = document.createElement('area');
	area.shape = shape;
	area.coords = coords;
	area.onmousedown = function() { emu.setONKeyPressed() }
	area.ontouchdown = function() { emu.setONKeyPressed() }
	area.onmouseup = function() { emu.setONKeyReleased() }
	area.ontouchup = function() { emu.setONKeyReleased() }
	map.appendChild(area);
}

function handle_keys_89_89T(event)
{
	var e = event || stdlib.event;
	e.preventDefault();
	var value;
	switch (e.type) {
		case 'keydown':
			value = 1;
			break;
		case 'keyup':
			value = 0;
			break;
		default:
			return true;
	}

	switch (e.keyCode)
	{
		case 113: emu.setKey(39, value); break; // F2
		case 112: emu.setKey(47, value); break; // F1
		case 114: emu.setKey(31, value); break; // F3
		case 115: emu.setKey(23, value); break; // F4
		case 116: emu.setKey(15, value); break; // F5
		case 27: emu.setKey(48, value); break; // ESC

		case 59: emu.setKey(16, value); break; // ;, simulated (-) (Firefox, Opera)
		case 186: emu.setKey(16, value); break; // ;, simulated (-) (Chrome, IE, Safari)

		case 43: emu.setKey(9, value); break; // + (Opera)
		case 45: emu.setKey(10, value); break; // -
		case 42: emu.setKey(11, value); break; // *
		case 47: emu.setKey(12, value); break; // /

		case 107: emu.setKey(9, value); break; // + (all browsers but Opera)
		case 109: emu.setKey(10, value); break; // - 
		case 106: emu.setKey(11, value); break; // *
		case 111: emu.setKey(12, value); break; // /

		case 8: emu.setKey(22, value); break; // backspace
		case 192: emu.setKey(4, value); break; // backquote, simulated 2nd
		case 38: emu.setKey(0, value); break; // up
		case 40: emu.setKey(2, value); break; // down
		case 37: emu.setKey(1, value); break; // left
		case 39: emu.setKey(3, value); break; // right
		case 190: emu.setKey(24, value); break; // . (decimal point)
		case 13: emu.setKey(8, value); break; // ENTER
		case 117: emu.setKey(47, value); break; // F6 is treated as F1
		case 118: emu.setKey(39, value); break; // F7 is treated as F2
		case 119: emu.setKey(31, value); break; // F8 is treated as F3
		case 121: emu.setKey(5, value); break; // F10 is treated as SHIFT
		case 48: emu.setKey(32, value); break; // 0
		case 49: emu.setKey(33, value); break; // 1
		case 50: emu.setKey(25, value); break; // 2
		case 51: emu.setKey(17, value); break; // 3
		case 52: emu.setKey(34, value); break; // 4
		case 53: emu.setKey(26, value); break; // 5
		case 54: emu.setKey(18, value); break; // 6
		case 55: emu.setKey(35, value); break; // 7
		case 56: emu.setKey(27, value); break; // 8
		case 57: emu.setKey(19, value); break; // 9
		case 84: emu.setKey(21, value); break; // T
		case 88: emu.setKey(45, value); break; // X
		case 89: emu.setKey(37, value); break; // Y
		case 90: emu.setKey(29, value); break; // Z
	}

	return true; // suppress default action
}

function handle_keys_92P_V200(event)
{
	var e = event || stdlib.event;
	e.preventDefault();
	var value;
	switch(e.type) {
		case 'keydown':
			value = 1;
			break;
		case 'keyup':
			value = 0;
			break;
		default:
			return true;
	}
	switch (e.keyCode)
	{
		case 113: emu.setKey(36, value); break; // F2
		case 112: emu.setKey(52, value); break; // F1
		case 114: emu.setKey(20, value); break; // F3
		case 115: emu.setKey(76, value); break; // F4
		case 116: emu.setKey(60, value); break; // F5
		case 117: emu.setKey(44, value); break; // F6
		case 118: emu.setKey(28, value); break; // F7
		case 119: emu.setKey(12, value); break; // F1
		case 27: emu.setKey(70, value); break; // ESC

		case 59: emu.setKey(81, value); break; // ;, simulated (-) (Firefox, Opera)
		case 186: emu.setKey(81, value); break; // ;, simulated (-) (Chrome, IE, Safari)

		case 43: emu.setKey(68, value); break; // + (Opera)
		case 45: emu.setKey(72, value); break; // -
		case 42: emu.setKey(63, value); break; // *
		case 47: emu.setKey(40, value); break; // /

		case 107: emu.setKey(68, value); break; // + (all browsers but Opera)
		case 109: emu.setKey(72, value); break; // - 
		case 106: emu.setKey(63, value); break; // *
		case 111: emu.setKey(40, value); break; // /

		case 32: emu.setKey(32, value); break; // spacebar
		case 8: emu.setKey(64, value); break; // backspace
		case 220: emu.setKey(3, value); break; // backslash, simulated LOCK (hand)
		case 192: emu.setKey(0, value); break; // backquote, simulated 2nd
		case 38: emu.setKey(5, value); break; // up
		case 40: emu.setKey(7, value); break; // down
		case 37: emu.setKey(4, value); break; // left
		case 39: emu.setKey(6, value); break; // right
		case 190: emu.setKey(78, value); break; // . (decimal point)
		case 13: emu.setKey(73, value); break; // ENTER
		case 120: emu.setKey(52, value); break; // F9 is treated as F1
		case 121: emu.setKey(2, value); break; // F10 is treated as SHIFT
		case 48: emu.setKey(77, value); break; // 0
		case 49: emu.setKey(13, value); break; // 1
		case 50: emu.setKey(14, value); break; // 2
		case 51: emu.setKey(15, value); break; // 3
		case 52: emu.setKey(21, value); break; // 4
		case 53: emu.setKey(22, value); break; // 5
		case 54: emu.setKey(23, value); break; // 6
		case 55: emu.setKey(29, value); break; // 7
		case 56: emu.setKey(30, value); break; // 8
		case 57: emu.setKey(31, value); break; // 9
		case 65: emu.setKey(74, value); break; // A - Z
		case 66: emu.setKey(41, value); break;
		case 67: emu.setKey(25, value); break;
		case 68: emu.setKey(18, value); break;
		case 69: emu.setKey(19, value); break;
		case 70: emu.setKey(26, value); break;
		case 71: emu.setKey(34, value); break;
		case 72: emu.setKey(42, value); break;
		case 73: emu.setKey(59, value); break;
		case 74: emu.setKey(50, value); break;
		case 75: emu.setKey(58, value); break;
		case 76: emu.setKey(66, value); break;
		case 77: emu.setKey(57, value); break;
		case 78: emu.setKey(49, value); break;
		case 79: emu.setKey(67, value); break;
		case 80: emu.setKey(55, value); break;
		case 81: emu.setKey(75, value); break;
		case 82: emu.setKey(27, value); break;
		case 83: emu.setKey(10, value); break;
		case 84: emu.setKey(35, value); break;
		case 85: emu.setKey(51, value); break;
		case 86: emu.setKey(33, value); break;
		case 87: emu.setKey(11, value); break;
		case 88: emu.setKey(17, value); break;
		case 89: emu.setKey(43, value); break;
		case 90: emu.setKey(9, value); break;
	}

	return true; // suppress default action
}

function initkeyhandlers()
{
	if (calculator_model == 3 || calculator_model == 9) // 89 or 89T
	{
		document.onkeydown = handle_keys_89_89T;
		document.onkeyup = handle_keys_89_89T;
	}
	else // 92+ or V200
	{
		document.onkeydown = handle_keys_92P_V200;
		document.onkeyup = handle_keys_92P_V200;
	}
}


function set_large_92p_skin()
{
	screen_scaling_ratio = 2;

	// TODO: replace image.
	var oldimg = document.getElementById('calcimg');
	var newimg = document.createElement('img');
	newimg.setAttribute("id", "calcimg");
	newimg.setAttribute("src", "Ti-92plus.jpg");
	newimg.setAttribute("usemap", "#map");

	oldimg.parentNode.appendChild(newimg);
	newimg.parentNode.removeChild(oldimg);

	create_button("rect", "140,52,193,112", 3); // LOCK (hand)
	create_button("rect", "871,69,920,108", 5); // Up
	create_button("rect", "871,157,920,196", 7); // Down
	create_button("rect", "834,110,872,156", 4); // Left
	create_button("rect", "921,110,971,156", 6); // Right
	create_button("rect", "724,55,768,95", 0); // 2nd (by cursor pad)
	create_button("rect", "200,497,246,527", 0); // 2nd (lower left) 46,30
	create_button("rect", "137,497,183,527", 1); // diamond
	create_button("rect", "74,450,120,480", 2); // shift
	create_button("rect", "137,451,183,481", 9); // Z
	create_button("rect", "168,401,214,431", 10); // S
	create_button("rect", "136,353,182,393", 11); // W
	create_button("rect", "141,271,184,311", 12); // F8 42,40
	create_button("rect", "724,453,770,483", 13); // 1
	create_button("rect", "784,453,830,483", 14); // 2
	create_button("rect", "845,453,891,483", 15); // 3
	create_button("rect", "200,450,246,480", 17); // X
	create_button("rect", "232,402,278,432", 18); // D
	create_button("rect", "199,354,245,384", 19); // E
	create_button("rect", "75,218,184,259", 20); // F3
	create_button("rect", "724,405,770,435", 21); // 4
	create_button("rect", "785,405,830,435", 22); // 5
	create_button("rect", "845,405,891,431", 23); // 6
	create_button("rect", "264,499,310,529", 24); // STO
	create_button("rect", "263,450,309,480", 25); // C
	create_button("rect", "294,403,340,433", 26); // F
	create_button("rect", "264,354,310,384", 27); // R
	create_button("rect", "141,219,184,259", 28); // F7
	create_button("rect", "724,357,770,387", 29); // 7
	create_button("rect", "785,357,830,387", 30); // 8
	create_button("rect", "845,357,891,387", 31); // 9
	create_button("rect", "327,499,495,529", 32); // SPACE
	create_button("rect", "326,450,372,480", 33); // V
	create_button("rect", "357,403,403,433", 34); // G
	create_button("rect", "327,354,373,384", 35); // T
	create_button("rect", "75,168,118,208", 36); // F2
	create_button("rect", "723,306,768,336", 37); // (
	create_button("rect", "784,306,830,336", 38); // )
	create_button("rect", "844,307,890,337", 39); // ,
	create_button("rect", "904,307,950,337", 40); // /
	create_button("rect", "388,452,434,483", 41); // B
	create_button("rect", "421,403,467,433", 42); // H
	create_button("rect", "389,355,435,385", 43); // Y
	create_button("rect", "141,168,184,208", 44); // F6
	create_button("rect", "724,260,770,290", 45); // SIN
	create_button("rect", "784,260,830,290", 46); // COS
	create_button("rect", "844,260,890,290", 47); // TAN
	create_button("rect", "905,260,951,290", 48); // ^
	create_button("rect", "453,451,499,481", 49); // N
	create_button("rect", "484,403,530,433", 50); // J
	create_button("rect", "452,355,498,385", 51); // U
	create_button("rect", "75,119,118,159", 52); // F1
	create_button("rect", "723,211,769,241", 53); // LN
	create_button("rect", "846,201,949,239", 54); // ENTER2 (by cursor pad)
	create_button("rect", "642,356,688,386", 55); // P
	create_button("rect", "516,500,562,530", 56); // =
	create_button("rect", "515,451,561,481", 57); // M
	create_button("rect", "547,403,593,433", 58); // K
	create_button("rect", "516,356,562,386", 59); // I
	create_button("rect", "141,119,284,159", 60); // F5
	create_button("rect", "724,163,790,193", 61); // CLEAR
	create_button("rect", "785,164,828,237", 62); // APPS
	create_button("rect", "905,357,951,387", 63); // *
	create_button("rect", "579,499,625,529", 64); // BACKSPACE
	create_button("rect", "578,451,624,481", 65); // THETA
	create_button("rect", "610,403,656,433", 66); // L
	create_button("rect", "579,356,623,386", 67); // O
	create_button("rect", "905,453,961,483", 68); // +
	create_button("rect", "724,115,770,145", 69); // MODE
	create_button("rect", "785,59,825,139", 70); // ESC
	create_button("rect", "904,404,950,434", 72); // -
	create_button("rect", "905,500,938,538", 73); // ENTER1 (numeric)
	create_button("rect", "624,454,685,528", 73); // ENTER1 (alphabetic)
	create_button("rect", "106,401,152,431", 74); // A
	create_button("rect", "74,353,120,383", 75); // Q
	create_button("rect", "75,271,118,311", 76); // F4
	create_button("rect", "724,501,770,531", 77); // 0
	create_button("rect", "784,502,830,532", 78); // .
	create_button("rect", "845,501,891,531", 79); // (-)

	create_on_button("rect", "74,497,120,527"); // ON: left of DIAMOND, below SHIFT
}

function set_small_89_skin()
{
	// TODO
	screen_scaling_ratio = 1;
}

function set_small_92p_skin()
{
	// TODO
	screen_scaling_ratio = 1;
}

function set_small_v200_skin()
{
	// TODO
	screen_scaling_ratio = 1;
	set_large_92p_skin();
}

function set_large_89t_skin()
{
	// TODO
	screen_scaling_ratio = 1;
}

function setCalculatorModel(model)
{
	calculator_model = model;
	switch (model) {
		case 1: set_skin = set_large_92p_skin; break;
		case 3: set_skin = set_small_89_skin; break;
		case 8: set_skin = set_small_v200_skin; break;
		case 9: set_skin = set_large_89t_skin; break;
		default: break;
	}
}

function reset()
{
	// Reset screen to white.
	for (var p = 0; p < calcscreen.length; calcscreen[p++] = 0x50) {};
}

function setEmu(newemu) {
	emu = newemu;
}

function setScreenScaling(scaling) {
	console.log("old scaling ratio: " +  screen_scaling_ratio + "\tnew scaling ratio: " + scaling);
	if (screen_scaling_ratio != scaling) {
		screen_scaling_ratio = scaling;
		initscreen();
	}
}

function initscreen()
{
	var elem = document.getElementById('screen');
	context = elem.getContext('2d');

	if (screen_scaling_ratio == 2) {
		if (context.createImageData)
			bitmap = context.createImageData(480, 256);
		else if (context.getImageData)
			bitmap = context.getImageData(0, 0, 960, 512);
		else
			bitmap = {'width' : 480, 'height' : 256, 'data' : new Uint8Array(480 * 256 * 4)};
	}
	else if (screen_scaling_ratio == 1) {
		if (context.createImageData)
			bitmap = context.createImageData(240, 128);
		else if (context.getImageData)
			bitmap = context.getImageData(0, 0, 960, 512);
		else
			bitmap = {'width' : 240, 'height' : 128, 'data' : new Uint8Array(240 * 128 * 4)};
	}

	// set all alpha channels to 255 (fully opaque)
	for (var x = 3; x < bitmap.data.length; x+= 4) bitmap.data[x] = 255;
}

function initemu() {
	set_skin();
}

function getPNG()
{
	var data = document.getElementById("screen").toDataURL("image/png");
	document.getElementById("pngimage").src = data;
	document.getElementById('pngButton').style.display='none';
	document.getElementById('pngimage').style.display='inline';
	document.getElementById('hideButton').style.display='inline'
}

function pngButtons()
{
	document.getElementById('pngimage').style.display='none';
	document.getElementById('hideButton').style.display='none';
	document.getElementById('pngButton').style.display='inline';
}

function pause_emulator()
{
	emu.pause_emulator();
	document.getElementById('pause_emulator').style.display='none';
	document.getElementById('resume_emulator').style.display='inline';
}

function resume_emulator()
{
	emu.resume_emulator();
	document.getElementById('pause_emulator').style.display='inline';
	document.getElementById('resume_emulator').style.display='none';
}

return {
	// Functions called directly from events on elements in the HTML page
	setScreenScaling : setScreenScaling,
	getPNG : getPNG,
	pngButtons : pngButtons,
	pause_emulator : pause_emulator,
	resume_emulator : resume_emulator,

	// Setter functions called from the core
	setCalculatorModel : setCalculatorModel,
	initkeyhandlers : initkeyhandlers,
	reset : reset,
	initemu : initemu,
	initscreen : initscreen,
	draw_screen : draw_screen,

	// Setter functions called by a script in the HTML page.
	setEmu : setEmu
};

}
