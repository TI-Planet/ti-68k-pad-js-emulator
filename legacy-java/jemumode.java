// Represents one of the 64 processor addressing modes, plus 8 fake addressing modes for values 1-8 embedded in instructions

public class jemumode
{
	static final int AREG = 8;
	static final int INDIRECT = 16;
	static final int POSTINC = 24;
	static final int PREDEC = 32;
	static final int AREG_OFFSET = 40;
	static final int AREG_INDEX = 48;
	static final int PC_INDEX = 59;
	static final int IMMED = 60; 
	static final int SR = 61; // pseudo addressing mode used for accessing SR
	static final int CONSTANT = 64;

	// Fill in addressing mode table (mode in high 3 bits of index, reg in low 3 bits)
	static void fillmodes(jemumode[] modes, jemuproc proc, jemucalc calc)
	{
		for (int mode = 0; mode < 64; mode++)
		{
			modes[mode] = new jemumode();
		}
		for (int mode = 64; mode < 72; mode++)
		{
			modes[mode] = new constant(mode - 64);
		}
		modes[IMMED] = new immediate();
		modes[15] = new a7();
		modes[58] = new pcrel();
		modes[0] = new d0();
		modes[57] = new abslong();
		modes[8] = new a0();
		modes[AREG_OFFSET + 0] = new a0offset();
		modes[INDIRECT + 0] = new a0ind();
		modes[56] = new absshort();
		modes[1] = new d1();
		modes[2] = new d2();
		modes[3] = new d3();
		modes[4] = new d4();
		modes[5] = new d5();
		modes[6] = new d6();
		modes[7] = new d7();
		modes[9] = new a1();
		modes[10] = new a2();
		modes[11] = new a3();
		modes[12] = new a4();
		modes[13] = new a5();
		modes[14] = new a6();
		modes[AREG_INDEX + 3] = new a3index();
		modes[POSTINC + 0] = new a0postinc();
		modes[POSTINC + 1] = new a1postinc();
		modes[POSTINC + 2] = new a2postinc();
		modes[POSTINC + 3] = new a3postinc();
		modes[POSTINC + 4] = new a4postinc();
		modes[POSTINC + 5] = new a5postinc();
		modes[POSTINC + 6] = new a6postinc();
		modes[POSTINC + 7] = new a7postinc();	
		modes[PREDEC + 7] = new a7predec();
		modes[INDIRECT + 1] = new a1ind();
		modes[INDIRECT + 2] = new a2ind();
		modes[INDIRECT + 3] = new a3ind();
		modes[INDIRECT + 4] = new a4ind();
		modes[INDIRECT + 5] = new a5ind();
		modes[INDIRECT + 6] = new a6ind();
		modes[INDIRECT + 7] = new a7ind();
		modes[AREG_OFFSET + 1] = new a1offset();
		modes[AREG_OFFSET + 2] = new a2offset();
		modes[AREG_OFFSET + 3] = new a3offset();
		modes[AREG_OFFSET + 4] = new a4offset();
		modes[AREG_OFFSET + 5] = new a5offset();
		modes[AREG_OFFSET + 6] = new a6offset();
		modes[AREG_OFFSET + 7] = new a7offset();
		modes[PC_INDEX] = new pcindex();
		modes[AREG_INDEX + 0] = new a0index();
		modes[AREG_INDEX + 1] = new a1index();
		modes[AREG_INDEX + 2] = new a2index();
		modes[AREG_INDEX + 4] = new a4index();
		modes[AREG_INDEX + 5] = new a5index();
		modes[AREG_INDEX + 6] = new a6index();
		modes[AREG_INDEX + 7] = new a7index();
		modes[PREDEC + 0] = new a0predec();
		modes[PREDEC + 1] = new a1predec();
		modes[PREDEC + 2] = new a2predec();
		modes[PREDEC + 3] = new a3predec();
		modes[PREDEC + 4] = new a4predec();
		modes[PREDEC + 5] = new a5predec();
		modes[PREDEC + 6] = new a6predec();
		modes[SR] = new sr();
		for (int mode = 0; mode < 64; mode++)
		{
			modes[mode].calc = calc;
			modes[mode].proc = proc;
		}			
	}

	byte readbyte(boolean sideeffects)
	{
		System.out.println("reading unknown addressing mode at " + proc.to_hex(proc.pc, 8));
		return 0;
	}
	short readword(boolean sideeffects)
	{
		System.out.println("reading unknown addressing mode at " + proc.to_hex(proc.pc, 8));
		return 0;
	}
	int readlong(boolean sideeffects)
	{
		System.out.println("reading unknown addressing mode at " + proc.to_hex(proc.pc, 8));
		return 0;
	}
	void writebyte(byte value)
	{
		System.out.println("writing unknown addressing mode at " + proc.to_hex(proc.pc, 8));
	}
	void writeword(short value)
	{
		System.out.println("writing unknown addressing mode at " + proc.to_hex(proc.pc, 8));
	}
	void writelong(int value)
	{
		System.out.println("writing unknown addressing mode at " + proc.to_hex(proc.pc, 8));
	}
	
	// Calculate effective address (for LEA PEA JMP JSR)
	int calcaddress()
	{
		System.out.println("calculating unknown addressing mode at " + proc.to_hex(proc.pc, 8));
		return 0;
	}
	
	// Return addressing mode name (for disassembly)
	String name() {	return "UNKNOWN"; }
	
	// Indicate whether this mode is valid as source or dest or calc (for building instruction table) and if it is an address reg
	boolean validsource() {	return false; }
	boolean validdest()	{ return false;	}
	boolean validcalc() { return false; }
	boolean isareg() { return false; }
	
	jemucalc calc;
	jemuproc proc;
}

final class immediate extends jemumode
{
	boolean validsource() {	return true; }
	String name() {	return "#immediate"; }
	int readlong(boolean sideeffects)
	{
		int value = calc.readlong(proc.pc); 
		proc.pc += 4;
		return value;
	}
	short readword(boolean sideeffects)
	{
		short value = calc.readword(proc.pc); 
		proc.pc += 2;
		return value;
	}
	byte readbyte(boolean sideeffects)
	{
		byte value = calc.readbyte(proc.pc + 1); 
		proc.pc += 2;
		return value;
	}
}

final class a7 extends jemumode 
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	String name() {	return "A7"; }
	short readword(boolean sideeffects) { return (short) proc.a7; }
	int readlong(boolean sideeffects) { return proc.a7; }
	void writeword(short value) { proc.a7 = value; } // in this case the sign extension is intended
	void writelong(int value) { proc.a7 = value; }
	boolean isareg() { return true; }
}

class a6 extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	String name() {	return "A6"; }
	short readword(boolean sideeffects) { return (short) proc.a6; }
	int readlong(boolean sideeffects) { return proc.a6; }
	void writeword(short value) { proc.a6 = value; } // in this case the sign extension is intended
	void writelong(int value) { proc.a6 = value; }
	boolean isareg() { return true; }
}

final class a5 extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	String name() {	return "A5"; }
	short readword(boolean sideeffects) { return (short) proc.a5; }
	int readlong(boolean sideeffects) { return proc.a5; }
	void writeword(short value) { proc.a5 = value; } // in this case the sign extension is intended
	void writelong(int value) { proc.a5 = value; }
	boolean isareg() { return true; }
}

final class a4 extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	String name() {	return "A4"; }
	short readword(boolean sideeffects) { return (short) proc.a4; }
	int readlong(boolean sideeffects) { return proc.a4; }
	void writeword(short value) { proc.a4 = value; } // in this case the sign extension is intended
	void writelong(int value) { proc.a4 = value; }
	boolean isareg() { return true; }
}

final class a3 extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	String name() {	return "A3"; }
	short readword(boolean sideeffects) { return (short) proc.a3; }
	int readlong(boolean sideeffects) { return proc.a3; }
	void writeword(short value) { proc.a3 = value; } // in this case the sign extension is intended
	void writelong(int value) { proc.a3 = value; }
	boolean isareg() { return true; }
}

final class a2 extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	String name() {	return "A2"; }
	short readword(boolean sideeffects) { return (short) proc.a2; }
	int readlong(boolean sideeffects) { return proc.a2; }
	void writeword(short value) { proc.a2 = value; } // in this case the sign extension is intended
	void writelong(int value) { proc.a2 = value; }
	boolean isareg() { return true; }
}

final class a1 extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	String name() {	return "A1"; }
	short readword(boolean sideeffects) { return (short) proc.a1; }
	int readlong(boolean sideeffects) { return proc.a1; }
	void writeword(short value) { proc.a1 = value; } // in this case the sign extension is intended
	void writelong(int value) { proc.a1 = value; }
	boolean isareg() { return true; }
}

final class a0 extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	String name() {	return "A0"; }
	short readword(boolean sideeffects) { return (short) proc.a0; }
	int readlong(boolean sideeffects) { return proc.a0; }
	void writeword(short value) { proc.a0 = value; } // in this case the sign extension is intended
	void writelong(int value) { proc.a0 = value; }
	boolean isareg() { return true; }
}

class pcrel extends jemumode
{
	boolean validsource() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "nnnn(PC)"; }
	short readword(boolean sideeffects)
	{
		short offset = calc.readword(proc.pc); 
		proc.pc += 2;
		return calc.readword(proc.pc - 2 + offset);
	}
	int readlong(boolean sideeffects)
	{
		short offset = calc.readword(proc.pc); 
		proc.pc += 2;
		return calc.readlong(proc.pc - 2 + offset);
	}
	byte readbyte(boolean sideeffects)
	{
		short offset = calc.readword(proc.pc); 
		proc.pc += 2;
		return calc.readbyte(proc.pc - 2 + offset);
	}
	int calcaddress()
	{
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		return proc.pc - 2 + offset;
	}	
}

class d0 extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	String name() {	return "D0"; }
	short readword(boolean sideeffects) { return (short) proc.d0; }
	int readlong(boolean sideeffects) { return proc.d0; }
	byte readbyte(boolean sideeffects) { return (byte) proc.d0; }
	void writebyte(byte value) { int x = value; proc.d0 = (proc.d0 & 0xFFFFFF00) | (value & 0xFF); }
	void writeword(short value) { int x = value; proc.d0 = (proc.d0 & 0xFFFF0000) | (value & 0xFFFF); }
	void writelong(int value) { proc.d0 = value; }
}

class d1 extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	String name() {	return "D1"; }
	short readword(boolean sideeffects) { return (short) proc.d1; }
	int readlong(boolean sideeffects) { return proc.d1; }
	byte readbyte(boolean sideeffects) { return (byte) proc.d1; }
	void writebyte(byte value) { int x = value; proc.d1 = (proc.d1 & 0xFFFFFF00) | (value & 0xFF); }
	void writeword(short value) { int x = value; proc.d1 = (proc.d1 & 0xFFFF0000) | (value & 0xFFFF); }
	void writelong(int value) { proc.d1 = value; }
}

class d2 extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	String name() {	return "D2"; }
	short readword(boolean sideeffects) { return (short) proc.d2; }
	int readlong(boolean sideeffects) { return proc.d2; }
	byte readbyte(boolean sideeffects) { return (byte) proc.d2; }
	void writebyte(byte value) { int x = value; proc.d2 = (proc.d2 & 0xFFFFFF00) | (value & 0xFF); }
	void writeword(short value) { int x = value; proc.d2 = (proc.d2 & 0xFFFF0000) | (value & 0xFFFF); }
	void writelong(int value) { proc.d2 = value; }
}

class d3 extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	String name() {	return "D3"; }
	short readword(boolean sideeffects) { return (short) proc.d3; }
	int readlong(boolean sideeffects) { return proc.d3; }
	byte readbyte(boolean sideeffects) { return (byte) proc.d3; }
	void writebyte(byte value) { int x = value; proc.d3 = (proc.d3 & 0xFFFFFF00) | (value & 0xFF); }
	void writeword(short value) { int x = value; proc.d3 = (proc.d3 & 0xFFFF0000) | (value & 0xFFFF); }
	void writelong(int value) { proc.d3 = value; }
}

class d4 extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	String name() {	return "D4"; }
	short readword(boolean sideeffects) { return (short) proc.d4; }
	int readlong(boolean sideeffects) { return proc.d4; }
	byte readbyte(boolean sideeffects) { return (byte) proc.d4; }
	void writebyte(byte value) { int x = value; proc.d4 = (proc.d4 & 0xFFFFFF00) | (value & 0xFF); }
	void writeword(short value) { int x = value; proc.d4 = (proc.d4 & 0xFFFF0000) | (value & 0xFFFF); }
	void writelong(int value) { proc.d4 = value; }
}

class d5 extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	String name() {	return "D5"; }
	short readword(boolean sideeffects) { return (short) proc.d5; }
	int readlong(boolean sideeffects) { return proc.d5; }
	byte readbyte(boolean sideeffects) { return (byte) proc.d5; }
	void writebyte(byte value) { int x = value; proc.d5 = (proc.d5 & 0xFFFFFF00) | (value & 0xFF); }
	void writeword(short value) { int x = value; proc.d5 = (proc.d5 & 0xFFFF0000) | (value & 0xFFFF); }
	void writelong(int value) { proc.d5 = value; }
}

class d6 extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	String name() {	return "D6"; }
	short readword(boolean sideeffects) { return (short) proc.d6; }
	int readlong(boolean sideeffects) { return proc.d6; }
	byte readbyte(boolean sideeffects) { return (byte) proc.d6; }
	void writebyte(byte value) { int x = value; proc.d6 = (proc.d6 & 0xFFFFFF00) | (value & 0xFF); }
	void writeword(short value) { int x = value; proc.d6 = (proc.d6 & 0xFFFF0000) | (value & 0xFFFF); }
	void writelong(int value) { proc.d6 = value; }
}

class d7 extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	String name() {	return "D7"; }
	short readword(boolean sideeffects) { return (short) proc.d7; }
	int readlong(boolean sideeffects) { return proc.d7; }
	byte readbyte(boolean sideeffects) { return (byte) proc.d7; }
	void writebyte(byte value) { int x = value; proc.d7 = (proc.d7 & 0xFFFFFF00) | (value & 0xFF); }
	void writeword(short value) { int x = value; proc.d7 = (proc.d7 & 0xFFFF0000) | (value & 0xFFFF); }
	void writelong(int value) { proc.d7 = value; }
}

class abslong extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "$nnnnnnnn.L"; }
	short readword(boolean sideeffects)
	{
		int addr = calc.readlong(proc.pc); 
		if (sideeffects) proc.pc += 4;
		return calc.readword(addr);
	}
	int readlong(boolean sideeffects)
	{
		int addr = calc.readlong(proc.pc); 
		if (sideeffects) proc.pc += 4;
		return calc.readlong(addr);
	}
	byte readbyte(boolean sideeffects)
	{
		int addr = calc.readlong(proc.pc); 
		if (sideeffects) proc.pc += 4;
		return calc.readbyte(addr);
	}
	void writeword(short value)
	{
		int addr = calc.readlong(proc.pc); 
		proc.pc += 4;
		calc.writeword(addr, value);
	}
	void writelong(int value)
	{
		int addr = calc.readlong(proc.pc); 
		proc.pc += 4;
		calc.writelong(addr, value);
	}
	void writebyte(byte value)
	{
		int addr = calc.readlong(proc.pc); 
		proc.pc += 4;
		calc.writebyte(addr, value);
	}
	int calcaddress()
	{
		int addr = calc.readlong(proc.pc); 
		proc.pc += 4;
		return addr;
	}
}

class a0offset extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "nnnn(A0)"; }
	short readword(boolean sideeffects) 
	{ 
		short offset = calc.readword(proc.pc);
		if (sideeffects) proc.pc += 2;
		return calc.readword(proc.a0 + offset); 
	}
	byte readbyte(boolean sideeffects) 
	{ 
		short offset = calc.readword(proc.pc);
		if (sideeffects) proc.pc += 2;
		return calc.readbyte(proc.a0 + offset); 
	}
	int readlong(boolean sideeffects) 
	{ 
		short offset = calc.readword(proc.pc);
		if (sideeffects) proc.pc += 2;
		return calc.readlong(proc.a0 + offset); 
	}
	void writeword(short value) 
	{ 
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		calc.writeword(proc.a0 + offset, value);
	}
	void writelong(int value) 
	{ 
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		calc.writelong(proc.a0 + offset, value);
	}
	void writebyte(byte value) 
	{ 
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		calc.writebyte(proc.a0 + offset, value);
	}
	int calcaddress()
	{
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		return proc.a0 + offset;
	}
}

class a1ind extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "(A1)"; }
	short readword(boolean sideeffects) { return calc.readword(proc.a1); }
	byte readbyte(boolean sideeffects) { return calc.readbyte(proc.a1); }
	int readlong(boolean sideeffects) { return calc.readlong(proc.a1); }
	void writeword(short value) { calc.writeword(proc.a1, value); }
	void writelong(int value) { calc.writelong(proc.a1, value); }
	void writebyte(byte value) { calc.writebyte(proc.a1, value); }
	int calcaddress() {	return proc.a1;	}
}

class a2ind extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "(A2)"; }
	short readword(boolean sideeffects) { return calc.readword(proc.a2); }
	byte readbyte(boolean sideeffects) { return calc.readbyte(proc.a2); }
	int readlong(boolean sideeffects) { return calc.readlong(proc.a2); }
	void writeword(short value) { calc.writeword(proc.a2, value); }
	void writelong(int value) { calc.writelong(proc.a2, value); }
	void writebyte(byte value) { calc.writebyte(proc.a2, value); }
	int calcaddress() {	return proc.a2;	}
}

class a3ind extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "(A3)"; }
	short readword(boolean sideeffects) { return calc.readword(proc.a3); }
	byte readbyte(boolean sideeffects) { return calc.readbyte(proc.a3); }
	int readlong(boolean sideeffects) { return calc.readlong(proc.a3); }
	void writeword(short value) { calc.writeword(proc.a3, value); }
	void writelong(int value) { calc.writelong(proc.a3, value); }
	void writebyte(byte value) { calc.writebyte(proc.a3, value); }
	int calcaddress() {	return proc.a3;	}
}

class a4ind extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "(A4)"; }
	short readword(boolean sideeffects) { return calc.readword(proc.a4); }
	byte readbyte(boolean sideeffects) { return calc.readbyte(proc.a4); }
	int readlong(boolean sideeffects) { return calc.readlong(proc.a4); }
	void writeword(short value) { calc.writeword(proc.a4, value); }
	void writelong(int value) { calc.writelong(proc.a4, value); }
	void writebyte(byte value) { calc.writebyte(proc.a4, value); }
	int calcaddress() {	return proc.a4;	}
}

class a5ind extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "(A5)"; }
	short readword(boolean sideeffects) { return calc.readword(proc.a5); }
	byte readbyte(boolean sideeffects) { return calc.readbyte(proc.a5); }
	int readlong(boolean sideeffects) { return calc.readlong(proc.a5); }
	void writeword(short value) { calc.writeword(proc.a5, value); }
	void writelong(int value) { calc.writelong(proc.a5, value); }
	void writebyte(byte value) { calc.writebyte(proc.a5, value); }
	int calcaddress() {	return proc.a5;	}
}

class a6ind extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "(A6)"; }
	short readword(boolean sideeffects) { return calc.readword(proc.a6); }
	byte readbyte(boolean sideeffects) { return calc.readbyte(proc.a6); }
	int readlong(boolean sideeffects) { return calc.readlong(proc.a6); }
	void writeword(short value) { calc.writeword(proc.a6,value); }
	void writelong(int value) { calc.writelong(proc.a6, value); }
	void writebyte(byte value) { calc.writebyte(proc.a6, value); }
	int calcaddress() {	return proc.a6;	}
}

class a7ind extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "(A7)"; }
	short readword(boolean sideeffects) { return calc.readword(proc.a7); }
	byte readbyte(boolean sideeffects) { return calc.readbyte(proc.a7); }
	int readlong(boolean sideeffects) { return calc.readlong(proc.a7); }
	void writeword(short value) { calc.writeword(proc.a7, value); }
	void writelong(int value) { calc.writelong(proc.a7, value); }
	void writebyte(byte value) { calc.writebyte(proc.a7, value); }
	int calcaddress() {	return proc.a7;	}
}

class a0ind extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "(A0)"; }
	short readword(boolean sideeffects) { return calc.readword(proc.a0); }
	byte readbyte(boolean sideeffects) { return calc.readbyte(proc.a0); }
	int readlong(boolean sideeffects) { return calc.readlong(proc.a0); }
	void writeword(short value) { calc.writeword(proc.a0, value); }
	void writelong(int value) { calc.writelong(proc.a0, value); }
	void writebyte(byte value) { calc.writebyte(proc.a0, value); }
	int calcaddress() {	return proc.a0;	}
}

class absshort extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "$nnnn.W"; }
	short readword(boolean sideeffects)
	{
		short addr = calc.readword(proc.pc); 
		if (sideeffects) proc.pc += 2;
		return calc.readword(addr);
	}
	int readlong(boolean sideeffects)
	{
		short addr = calc.readword(proc.pc); 
		if (sideeffects) proc.pc += 2;
		return calc.readlong(addr);
	}
	byte readbyte(boolean sideeffects)
	{
		short addr = calc.readword(proc.pc); 
		if (sideeffects) proc.pc += 2;
		return calc.readbyte(addr);
	}
	void writeword(short value)
	{
		short addr = calc.readword(proc.pc); 
		proc.pc += 2;
		calc.writeword(addr, value);
	}
	void writelong(int value)
	{
		short addr = calc.readword(proc.pc); 
		proc.pc += 2;
		calc.writelong(addr, value);
	}
	void writebyte(byte value)
	{
		short addr = calc.readword(proc.pc); 
		proc.pc += 2;
		calc.writebyte(addr, value);
	}
	int calcaddress()
	{
		short addr = calc.readword(proc.pc); 
		proc.pc += 2;
		return addr;
	}
}

class a3index extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "nn(A3,Rn)"; }
	short readword(boolean sideeffects) { return calc.readword(getaddress(sideeffects)); }
	byte readbyte(boolean sideeffects) { return calc.readbyte(getaddress(sideeffects)); }
	int readlong(boolean sideeffects) { return calc.readlong(getaddress(sideeffects)); }
	void writeword(short value) { calc.writeword(calcaddress(), value);	}
	void writelong(int value) { calc.writelong(calcaddress(), value); }
	void writebyte(byte value) { calc.writebyte(calcaddress(), value); }
	int calcaddress() {	return getaddress(true); }
	int getaddress(boolean sideeffects)
	{
		short extension = calc.readword(proc.pc);
		int offset = (byte)(extension & 0xFF); // displacement from instruction
		int reg = (extension >> 12) & 7; // register number
		reg = ((extension & 0x8000) == 0) ? proc.dn(reg) : proc.an(reg); // high bit switches Dreg / Areg
		if ((extension & 0x800) == 0) reg = (short) reg; // sign extend if flag indicates it is a word
		if (sideeffects) proc.pc += 2;
		//System.out.println("Calculated indexed address as " + proc.to_hex(proc.a3 + offset + reg, 8));
		return proc.a3 + offset + reg;
	}
}

class constant extends jemumode
{
	String name() { return "#" + value; }
	int value;
	byte readbyte(boolean sideeffects) { return (byte)value; }
	short readword(boolean sideeffects) { return (short)value; }
	int readlong(boolean sideeffects) { return value; }
	constant(int n) { this.value = n == 0 ? 8 : n; }
}

class a1postinc extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return false; }
	String name() {	return "(A1)+"; }
	short readword(boolean sideeffects) { short value = calc.readword(proc.a1); if (sideeffects) proc.a1 += 2; return value; }
	byte readbyte(boolean sideeffects) { byte value = calc.readbyte(proc.a1); if (sideeffects) proc.a1 += 1; return value; }
	int readlong(boolean sideeffects) { int value = calc.readlong(proc.a1); if (sideeffects) proc.a1 += 4; return value; }
	void writeword(short value) { calc.writeword(proc.a1, value); proc.a1 += 2; }
	void writelong(int value) { calc.writelong(proc.a1, value); proc.a1 += 4; }
	void writebyte(byte value) { calc.writebyte(proc.a1, value); proc.a1 += 1; }
}

class a2postinc extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return false; }
	String name() {	return "(A2)+"; }
	short readword(boolean sideeffects) { short value = calc.readword(proc.a2); if (sideeffects) proc.a2 += 2; return value; }
	byte readbyte(boolean sideeffects) { byte value = calc.readbyte(proc.a2); if (sideeffects) proc.a2 += 1; return value; }
	int readlong(boolean sideeffects) { int value = calc.readlong(proc.a2); if (sideeffects) proc.a2 += 4; return value; }
	void writeword(short value) { calc.writeword(proc.a2, value); proc.a2 += 2; }
	void writelong(int value) { calc.writelong(proc.a2, value); proc.a2 += 4; }
	void writebyte(byte value) { calc.writebyte(proc.a2, value); proc.a2 += 1; }
}

class a3postinc extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return false; }
	String name() {	return "(A3)+"; }
	short readword(boolean sideeffects) { short value = calc.readword(proc.a3); if (sideeffects) proc.a3 += 2; return value; }
	byte readbyte(boolean sideeffects) { byte value = calc.readbyte(proc.a3); if (sideeffects) proc.a3 += 1; return value; }
	int readlong(boolean sideeffects) { int value = calc.readlong(proc.a3); if (sideeffects) proc.a3 += 4; return value; }
	void writeword(short value) { calc.writeword(proc.a3, value); proc.a3 += 2; }
	void writelong(int value) { calc.writelong(proc.a3, value); proc.a3 += 4; }
	void writebyte(byte value) { calc.writebyte(proc.a3, value); proc.a3 += 1; }
}

class a4postinc extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return false; }
	String name() {	return "(A4)+"; }
	short readword(boolean sideeffects) { short value = calc.readword(proc.a4); if (sideeffects) proc.a4 += 2; return value; }
	byte readbyte(boolean sideeffects) { byte value = calc.readbyte(proc.a4); if (sideeffects) proc.a4 += 1; return value; }
	int readlong(boolean sideeffects) { int value = calc.readlong(proc.a4); if (sideeffects) proc.a4 += 4; return value; }
	void writeword(short value) { calc.writeword(proc.a4, value); proc.a4 += 2; }
	void writelong(int value) { calc.writelong(proc.a4, value); proc.a4 += 4; }
	void writebyte(byte value) { calc.writebyte(proc.a4, value); proc.a4 += 1; }
}

class a0postinc extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return false; }
	String name() {	return "(A0)+"; }
	short readword(boolean sideeffects) { short value = calc.readword(proc.a0); if (sideeffects) proc.a0 += 2; return value; }
	byte readbyte(boolean sideeffects) { byte value = calc.readbyte(proc.a0); if (sideeffects) proc.a0 += 1; return value; }
	int readlong(boolean sideeffects) { int value = calc.readlong(proc.a0); if (sideeffects) proc.a0 += 4; return value; }
	void writeword(short value) { calc.writeword(proc.a0, value); proc.a0 += 2; }
	void writelong(int value) { calc.writelong(proc.a0, value); proc.a0 += 4; }
	void writebyte(byte value) { calc.writebyte(proc.a0, value); proc.a0 += 1; }
}

class a5postinc extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return false; }
	String name() {	return "(A5)+"; }
	short readword(boolean sideeffects) { short value = calc.readword(proc.a5); if (sideeffects) proc.a5 += 2; return value; }
	byte readbyte(boolean sideeffects) { byte value = calc.readbyte(proc.a5); if (sideeffects) proc.a5 += 1; return value; }
	int readlong(boolean sideeffects) { int value = calc.readlong(proc.a5); if (sideeffects) proc.a5 += 4; return value; }
	void writeword(short value) { calc.writeword(proc.a5, value); proc.a5 += 2; }
	void writelong(int value) { calc.writelong(proc.a5, value); proc.a5 += 4; }
	void writebyte(byte value) { calc.writebyte(proc.a5, value); proc.a5 += 1; }
}

class a6postinc extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return false; }
	String name() {	return "(A6)+"; }
	short readword(boolean sideeffects) { short value = calc.readword(proc.a6); if (sideeffects) proc.a6 += 2; return value; }
	byte readbyte(boolean sideeffects) { byte value = calc.readbyte(proc.a6); if (sideeffects) proc.a6 += 1; return value; }
	int readlong(boolean sideeffects) { int value = calc.readlong(proc.a6); if (sideeffects) proc.a6 += 4; return value; }
	void writeword(short value) { calc.writeword(proc.a6, value); proc.a6 += 2; }
	void writelong(int value) { calc.writelong(proc.a6, value); proc.a6 += 4; }
	void writebyte(byte value) { calc.writebyte(proc.a6, value); proc.a6 += 1; }
}

class a7postinc extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return false; }
	String name() {	return "(A7)+"; }
	short readword(boolean sideeffects) { short value = calc.readword(proc.a7); if (sideeffects) proc.a7 += 2; return value; }
	byte readbyte(boolean sideeffects) { byte value = calc.readbyte(proc.a7); if (sideeffects) proc.a7 += 2; return value; } // special case handling of A7 to keep it even
	int readlong(boolean sideeffects) { int value = calc.readlong(proc.a7); if (sideeffects) proc.a7 += 4; return value; }
	void writeword(short value) { calc.writeword(proc.a7, value); proc.a7 += 2; }
	void writelong(int value) { calc.writelong(proc.a7, value); proc.a7 += 4; }
	void writebyte(byte value) { calc.writebyte(proc.a7, value); proc.a7 += 2; } // special case handling of A7 to keep it even
}

class a7predec extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return false; }
	String name() {	return "-(A7)"; }
	short readword(boolean sideeffects) { short value = calc.readword(proc.a7 - 2); if (sideeffects) proc.a7 -= 2; return value; }
	byte readbyte(boolean sideeffects) { byte value = calc.readbyte(proc.a7 - 2); if (sideeffects) proc.a7 -= 2; return value; } // special case handling of A7 to keep it even
	int readlong(boolean sideeffects) { int value = calc.readlong(proc.a7 - 4); if (sideeffects) proc.a7 -= 4; return value; }
	void writeword(short value) { calc.writeword(proc.a7 - 2, value); proc.a7 -= 2; }
	void writelong(int value) { calc.writelong(proc.a7 - 4, value); proc.a7 -= 4; }
	void writebyte(byte value) { calc.writebyte(proc.a7 - 2, value); proc.a7 -= 2; } // special case handling of A7 to keep it even
}

class a1offset extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "nnnn(A1)"; }
	short readword(boolean sideeffects) 
	{ 
		short offset = calc.readword(proc.pc);
		if (sideeffects) proc.pc += 2;
		return calc.readword(proc.a1 + offset); 
	}
	byte readbyte(boolean sideeffects) 
	{ 
		short offset = calc.readword(proc.pc);
		if (sideeffects) proc.pc += 2;
		return calc.readbyte(proc.a1 + offset); 
	}
	int readlong(boolean sideeffects) 
	{ 
		short offset = calc.readword(proc.pc);
		if (sideeffects) proc.pc += 2;
		return calc.readlong(proc.a1 + offset); 
	}
	void writeword(short value) 
	{ 
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		calc.writeword(proc.a1 + offset, value);
	}
	void writelong(int value) 
	{ 
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		calc.writelong(proc.a1 + offset, value);
	}
	void writebyte(byte value) 
	{ 
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		calc.writebyte(proc.a1 + offset, value);
	}
	int calcaddress()
	{
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		return proc.a1 + offset;
	}
}

class a2offset extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "nnnn(A2)"; }
	short readword(boolean sideeffects) 
	{ 
		short offset = calc.readword(proc.pc);
		if (sideeffects) proc.pc += 2;
		return calc.readword(proc.a2 + offset); 
	}
	byte readbyte(boolean sideeffects) 
	{ 
		short offset = calc.readword(proc.pc);
		if (sideeffects) proc.pc += 2;
		return calc.readbyte(proc.a2 + offset); 
	}
	int readlong(boolean sideeffects) 
	{ 
		short offset = calc.readword(proc.pc);
		if (sideeffects) proc.pc += 2;
		return calc.readlong(proc.a2 + offset); 
	}
	void writeword(short value) 
	{ 
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		calc.writeword(proc.a2 + offset, value);
	}
	void writelong(int value) 
	{ 
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		calc.writelong(proc.a2 + offset, value);
	}
	void writebyte(byte value) 
	{ 
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		calc.writebyte(proc.a2 + offset, value);
	}
	int calcaddress()
	{
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		return proc.a2 + offset;
	}
}
class a3offset extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "nnnn(A3)"; }
	short readword(boolean sideeffects) 
	{ 
		short offset = calc.readword(proc.pc);
		if (sideeffects) proc.pc += 2;
		return calc.readword(proc.a3 + offset); 
	}
	byte readbyte(boolean sideeffects) 
	{ 
		short offset = calc.readword(proc.pc);
		if (sideeffects) proc.pc += 2;
		return calc.readbyte(proc.a3 + offset); 
	}
	int readlong(boolean sideeffects) 
	{ 
		short offset = calc.readword(proc.pc);
		if (sideeffects) proc.pc += 2;
		return calc.readlong(proc.a3 + offset); 
	}
	void writeword(short value) 
	{ 
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		calc.writeword(proc.a3 + offset, value);
	}
	void writelong(int value) 
	{ 
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		calc.writelong(proc.a3 + offset, value);
	}
	void writebyte(byte value) 
	{ 
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		calc.writebyte(proc.a3 + offset, value);
	}
	int calcaddress()
	{
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		return proc.a3 + offset;
	}
}
class a4offset extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "nnnn(A4)"; }
	short readword(boolean sideeffects) 
	{ 
		short offset = calc.readword(proc.pc);
		if (sideeffects) proc.pc += 2;
		return calc.readword(proc.a4 + offset); 
	}
	byte readbyte(boolean sideeffects) 
	{ 
		short offset = calc.readword(proc.pc);
		if (sideeffects) proc.pc += 2;
		return calc.readbyte(proc.a4 + offset); 
	}
	int readlong(boolean sideeffects) 
	{ 
		short offset = calc.readword(proc.pc);
		if (sideeffects) proc.pc += 2;
		return calc.readlong(proc.a4 + offset); 
	}
	void writeword(short value) 
	{ 
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		calc.writeword(proc.a4 + offset, value);
	}
	void writelong(int value) 
	{ 
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		calc.writelong(proc.a4 + offset, value);
	}
	void writebyte(byte value) 
	{ 
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		calc.writebyte(proc.a4 + offset, value);
	}
	int calcaddress()
	{
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		return proc.a4 + offset;
	}
}

class a5offset extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "nnnn(A5)"; }
	short readword(boolean sideeffects) 
	{ 
		short offset = calc.readword(proc.pc);
		if (sideeffects) proc.pc += 2;
		return calc.readword(proc.a5 + offset); 
	}
	byte readbyte(boolean sideeffects) 
	{ 
		short offset = calc.readword(proc.pc);
		if (sideeffects) proc.pc += 2;
		return calc.readbyte(proc.a5 + offset); 
	}
	int readlong(boolean sideeffects) 
	{ 
		short offset = calc.readword(proc.pc);
		if (sideeffects) proc.pc += 2;
		return calc.readlong(proc.a5 + offset); 
	}
	void writeword(short value) 
	{ 
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		calc.writeword(proc.a5 + offset, value);
	}
	void writelong(int value) 
	{ 
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		calc.writelong(proc.a5 + offset, value);
	}
	void writebyte(byte value) 
	{ 
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		calc.writebyte(proc.a5 + offset, value);
	}
	int calcaddress()
	{
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		return proc.a5 + offset;
	}
}

class a6offset extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "nnnn(A6)"; }
	short readword(boolean sideeffects) 
	{ 
		short offset = calc.readword(proc.pc);
		if (sideeffects) proc.pc += 2;
		return calc.readword(proc.a6 + offset); 
	}
	byte readbyte(boolean sideeffects) 
	{ 
		short offset = calc.readword(proc.pc);
		if (sideeffects) proc.pc += 2;
		return calc.readbyte(proc.a6 + offset); 
	}
	int readlong(boolean sideeffects) 
	{ 
		short offset = calc.readword(proc.pc);
		if (sideeffects) proc.pc += 2;
		return calc.readlong(proc.a6 + offset); 
	}
	void writeword(short value) 
	{ 
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		calc.writeword(proc.a6 + offset, value);
	}
	void writelong(int value) 
	{ 
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		calc.writelong(proc.a6 + offset, value);
	}
	void writebyte(byte value) 
	{ 
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		calc.writebyte(proc.a6 + offset, value);
	}
	int calcaddress()
	{
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		return proc.a6 + offset;
	}
}

class a7offset extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "nnnn(A7)"; }
	short readword(boolean sideeffects) 
	{ 
		short offset = calc.readword(proc.pc);
		if (sideeffects) proc.pc += 2;
		return calc.readword(proc.a7 + offset); 
	}
	byte readbyte(boolean sideeffects) 
	{ 
		short offset = calc.readword(proc.pc);
		if (sideeffects) proc.pc += 2;
		return calc.readbyte(proc.a7 + offset); 
	}
	int readlong(boolean sideeffects) 
	{ 
		short offset = calc.readword(proc.pc);
		if (sideeffects) proc.pc += 2;
		return calc.readlong(proc.a7 + offset); 
	}
	void writeword(short value) 
	{ 
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		calc.writeword(proc.a7 + offset, value);
	}
	void writelong(int value) 
	{ 
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		calc.writelong(proc.a7 + offset, value);
	}
	void writebyte(byte value) 
	{ 
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		calc.writebyte(proc.a7 + offset, value);
	}
	int calcaddress()
	{
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		return proc.a7 + offset;
	}
}

class pcindex extends jemumode
{
	boolean validsource() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "nn(PC,Rn)"; }
	short readword(boolean sideeffects) { return calc.readword(getaddress(sideeffects)); }
	byte readbyte(boolean sideeffects) { return calc.readbyte(getaddress(sideeffects)); }
	int readlong(boolean sideeffects) { return calc.readlong(getaddress(sideeffects)); }
	int calcaddress() {	return getaddress(true); }
	int getaddress(boolean sideeffects)
	{
		short extension = calc.readword(proc.pc);
		int offset = (byte)(extension & 0xFF); // displacement from instruction
		int reg = (extension >> 12) & 7; // register number
		reg = ((extension & 0x8000) == 0) ? proc.dn(reg) : proc.an(reg); // high bit switches Dreg / Areg
		if ((extension & 0x800) == 0) reg = (short) reg; // sign extend if flag indicates it is a word
		//System.out.println("Calculated indexed address as " + proc.to_hex(proc.a3 + offset + reg, 8));
		int result = proc.pc + offset + reg;
		if (sideeffects) proc.pc += 2;
		return result;
	}
}

class a0index extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "nn(A0,Rn)"; }
	short readword(boolean sideeffects) { return calc.readword(getaddress(sideeffects)); }
	byte readbyte(boolean sideeffects) { return calc.readbyte(getaddress(sideeffects)); }
	int readlong(boolean sideeffects) { return calc.readlong(getaddress(sideeffects)); }
	void writeword(short value) { calc.writeword(calcaddress(), value);	}
	void writelong(int value) { calc.writelong(calcaddress(), value); }
	void writebyte(byte value) { calc.writebyte(calcaddress(), value); }
	int calcaddress() {	return getaddress(true); }
	int getaddress(boolean sideeffects)
	{
		short extension = calc.readword(proc.pc);
		int offset = (byte)(extension & 0xFF); // displacement from instruction
		int reg = (extension >> 12) & 7; // register number
		reg = ((extension & 0x8000) == 0) ? proc.dn(reg) : proc.an(reg); // high bit switches Dreg / Areg
		if ((extension & 0x800) == 0) reg = (short) reg; // sign extend if flag indicates it is a word
		if (sideeffects) proc.pc += 2;
		//System.out.println("Calculated indexed address as " + proc.to_hex(proc.a3 + offset + reg, 8));
		return proc.a0 + offset + reg;
	}
}

class a1index extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "nn(A1,Rn)"; }
	short readword(boolean sideeffects) { return calc.readword(getaddress(sideeffects)); }
	byte readbyte(boolean sideeffects) { return calc.readbyte(getaddress(sideeffects)); }
	int readlong(boolean sideeffects) { return calc.readlong(getaddress(sideeffects)); }
	void writeword(short value) { calc.writeword(calcaddress(), value);	}
	void writelong(int value) { calc.writelong(calcaddress(), value); }
	void writebyte(byte value) { calc.writebyte(calcaddress(), value); }
	int calcaddress() {	return getaddress(true); }
	int getaddress(boolean sideeffects)
	{
		short extension = calc.readword(proc.pc);
		int offset = (byte)(extension & 0xFF); // displacement from instruction
		int reg = (extension >> 12) & 7; // register number
		reg = ((extension & 0x8000) == 0) ? proc.dn(reg) : proc.an(reg); // high bit switches Dreg / Areg
		if ((extension & 0x800) == 0) reg = (short) reg; // sign extend if flag indicates it is a word
		if (sideeffects) proc.pc += 2;
		//System.out.println("Calculated indexed address as " + proc.to_hex(proc.a3 + offset + reg, 8));
		return proc.a1 + offset + reg;
	}
}

class a2index extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "nn(A2,Rn)"; }
	short readword(boolean sideeffects) { return calc.readword(getaddress(sideeffects)); }
	byte readbyte(boolean sideeffects) { return calc.readbyte(getaddress(sideeffects)); }
	int readlong(boolean sideeffects) { return calc.readlong(getaddress(sideeffects)); }
	void writeword(short value) { calc.writeword(calcaddress(), value);	}
	void writelong(int value) { calc.writelong(calcaddress(), value); }
	void writebyte(byte value) { calc.writebyte(calcaddress(), value); }
	int calcaddress() {	return getaddress(true); }
	int getaddress(boolean sideeffects)
	{
		short extension = calc.readword(proc.pc);
		int offset = (byte)(extension & 0xFF); // displacement from instruction
		int reg = (extension >> 12) & 7; // register number
		reg = ((extension & 0x8000) == 0) ? proc.dn(reg) : proc.an(reg); // high bit switches Dreg / Areg
		if ((extension & 0x800) == 0) reg = (short) reg; // sign extend if flag indicates it is a word
		if (sideeffects) proc.pc += 2;
		//System.out.println("Calculated indexed address as " + proc.to_hex(proc.a3 + offset + reg, 8));
		return proc.a2 + offset + reg;
	}
}

class a4index extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "nn(A4,Rn)"; }
	short readword(boolean sideeffects) { return calc.readword(getaddress(sideeffects)); }
	byte readbyte(boolean sideeffects) { return calc.readbyte(getaddress(sideeffects)); }
	int readlong(boolean sideeffects) { return calc.readlong(getaddress(sideeffects)); }
	void writeword(short value) { calc.writeword(calcaddress(), value);	}
	void writelong(int value) { calc.writelong(calcaddress(), value); }
	void writebyte(byte value) { calc.writebyte(calcaddress(), value); }
	int calcaddress() {	return getaddress(true); }
	int getaddress(boolean sideeffects)
	{
		short extension = calc.readword(proc.pc);
		int offset = (byte)(extension & 0xFF); // displacement from instruction
		int reg = (extension >> 12) & 7; // register number
		reg = ((extension & 0x8000) == 0) ? proc.dn(reg) : proc.an(reg); // high bit switches Dreg / Areg
		if ((extension & 0x800) == 0) reg = (short) reg; // sign extend if flag indicates it is a word
		if (sideeffects) proc.pc += 2;
		//System.out.println("Calculated indexed address as " + proc.to_hex(proc.a3 + offset + reg, 8));
		return proc.a4 + offset + reg;
	}
}

class a5index extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "nn(A5,Rn)"; }
	short readword(boolean sideeffects) { return calc.readword(getaddress(sideeffects)); }
	byte readbyte(boolean sideeffects) { return calc.readbyte(getaddress(sideeffects)); }
	int readlong(boolean sideeffects) { return calc.readlong(getaddress(sideeffects)); }
	void writeword(short value) { calc.writeword(calcaddress(), value);	}
	void writelong(int value) { calc.writelong(calcaddress(), value); }
	void writebyte(byte value) { calc.writebyte(calcaddress(), value); }
	int calcaddress() {	return getaddress(true); }
	int getaddress(boolean sideeffects)
	{
		short extension = calc.readword(proc.pc);
		int offset = (byte)(extension & 0xFF); // displacement from instruction
		int reg = (extension >> 12) & 7; // register number
		reg = ((extension & 0x8000) == 0) ? proc.dn(reg) : proc.an(reg); // high bit switches Dreg / Areg
		if ((extension & 0x800) == 0) reg = (short) reg; // sign extend if flag indicates it is a word
		if (sideeffects) proc.pc += 2;
		//System.out.println("Calculated indexed address as " + proc.to_hex(proc.a3 + offset + reg, 8));
		return proc.a5 + offset + reg;
	}
}

class a6index extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "nn(A6,Rn)"; }
	short readword(boolean sideeffects) { return calc.readword(getaddress(sideeffects)); }
	byte readbyte(boolean sideeffects) { return calc.readbyte(getaddress(sideeffects)); }
	int readlong(boolean sideeffects) { return calc.readlong(getaddress(sideeffects)); }
	void writeword(short value) { calc.writeword(calcaddress(), value);	}
	void writelong(int value) { calc.writelong(calcaddress(), value); }
	void writebyte(byte value) { calc.writebyte(calcaddress(), value); }
	int calcaddress() {	return getaddress(true); }
	int getaddress(boolean sideeffects)
	{
		short extension = calc.readword(proc.pc);
		int offset = (byte)(extension & 0xFF); // displacement from instruction
		int reg = (extension >> 12) & 7; // register number
		reg = ((extension & 0x8000) == 0) ? proc.dn(reg) : proc.an(reg); // high bit switches Dreg / Areg
		if ((extension & 0x800) == 0) reg = (short) reg; // sign extend if flag indicates it is a word
		if (sideeffects) proc.pc += 2;
		//System.out.println("Calculated indexed address as " + proc.to_hex(proc.a3 + offset + reg, 8));
		return proc.a6 + offset + reg;
	}
}

class a7index extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return true; }
	String name() {	return "nn(A7,Rn)"; }
	short readword(boolean sideeffects) { return calc.readword(getaddress(sideeffects)); }
	byte readbyte(boolean sideeffects) { return calc.readbyte(getaddress(sideeffects)); }
	int readlong(boolean sideeffects) { return calc.readlong(getaddress(sideeffects)); }
	void writeword(short value) { calc.writeword(calcaddress(), value);	}
	void writelong(int value) { calc.writelong(calcaddress(), value); }
	void writebyte(byte value) { calc.writebyte(calcaddress(), value); }
	int calcaddress() {	return getaddress(true); }
	int getaddress(boolean sideeffects)
	{
		short extension = calc.readword(proc.pc);
		int offset = (byte)(extension & 0xFF); // displacement from instruction
		int reg = (extension >> 12) & 7; // register number
		reg = ((extension & 0x8000) == 0) ? proc.dn(reg) : proc.an(reg); // high bit switches Dreg / Areg
		if ((extension & 0x800) == 0) reg = (short) reg; // sign extend if flag indicates it is a word
		if (sideeffects) proc.pc += 2;
		//System.out.println("Calculated indexed address as " + proc.to_hex(proc.a3 + offset + reg, 8));
		return proc.a7 + offset + reg;
	}
}

class a6predec extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return false; }
	String name() {	return "-(A6)"; }
	short readword(boolean sideeffects) { short value = calc.readword(proc.a6 - 2); if (sideeffects) proc.a6 -= 2; return value; }
	byte readbyte(boolean sideeffects) { byte value = calc.readbyte(proc.a6 - 1); if (sideeffects) proc.a6 -= 1; return value; } 
	int readlong(boolean sideeffects) { int value = calc.readlong(proc.a6 - 4); if (sideeffects) proc.a6 -= 4; return value; }
	void writeword(short value) { calc.writeword(proc.a6 - 2, value); proc.a6 -= 2; }
	void writelong(int value) { calc.writelong(proc.a6 - 4, value); proc.a6 -= 4; }
	void writebyte(byte value) { calc.writebyte(proc.a6 - 1, value); proc.a6 -= 1; } 
}

class a5predec extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return false; }
	String name() {	return "-(A5)"; }
	short readword(boolean sideeffects) { short value = calc.readword(proc.a5 - 2); if (sideeffects) proc.a5 -= 2; return value; }
	byte readbyte(boolean sideeffects) { byte value = calc.readbyte(proc.a5 - 1); if (sideeffects) proc.a5 -= 1; return value; } 
	int readlong(boolean sideeffects) { int value = calc.readlong(proc.a5 - 4); if (sideeffects) proc.a5 -= 4; return value; }
	void writeword(short value) { calc.writeword(proc.a5 - 2, value); proc.a5 -= 2; }
	void writelong(int value) { calc.writelong(proc.a5 - 4, value); proc.a5 -= 4; }
	void writebyte(byte value) { calc.writebyte(proc.a5 - 1, value); proc.a5 -= 1; } 
}

class a4predec extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return false; }
	String name() {	return "-(A4)"; }
	short readword(boolean sideeffects) { short value = calc.readword(proc.a4 - 2); if (sideeffects) proc.a4 -= 2; return value; }
	byte readbyte(boolean sideeffects) { byte value = calc.readbyte(proc.a4 - 1); if (sideeffects) proc.a4 -= 1; return value; } 
	int readlong(boolean sideeffects) { int value = calc.readlong(proc.a4 - 4); if (sideeffects) proc.a4 -= 4; return value; }
	void writeword(short value) { calc.writeword(proc.a4 - 2, value); proc.a4 -= 2; }
	void writelong(int value) { calc.writelong(proc.a4 - 4, value); proc.a4 -= 4; }
	void writebyte(byte value) { calc.writebyte(proc.a4 - 1, value); proc.a4 -= 1; } 
}

class a3predec extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return false; }
	String name() {	return "-(A3)"; }
	short readword(boolean sideeffects) { short value = calc.readword(proc.a3 - 2); if (sideeffects) proc.a3 -= 2; return value; }
	byte readbyte(boolean sideeffects) { byte value = calc.readbyte(proc.a3 - 1); if (sideeffects) proc.a3 -= 1; return value; } 
	int readlong(boolean sideeffects) { int value = calc.readlong(proc.a3 - 4); if (sideeffects) proc.a3 -= 4; return value; }
	void writeword(short value) { calc.writeword(proc.a3 - 2, value); proc.a3 -= 2; }
	void writelong(int value) { calc.writelong(proc.a3 - 4, value); proc.a3 -= 4; }
	void writebyte(byte value) { calc.writebyte(proc.a3 - 1, value); proc.a3 -= 1; } 
}

class a2predec extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return false; }
	String name() {	return "-(A2)"; }
	short readword(boolean sideeffects) { short value = calc.readword(proc.a2 - 2); if (sideeffects) proc.a2 -= 2; return value; }
	byte readbyte(boolean sideeffects) { byte value = calc.readbyte(proc.a2 - 1); if (sideeffects) proc.a2 -= 1; return value; } 
	int readlong(boolean sideeffects) { int value = calc.readlong(proc.a2 - 4); if (sideeffects) proc.a2 -= 4; return value; }
	void writeword(short value) { calc.writeword(proc.a2 - 2, value); proc.a2 -= 2; }
	void writelong(int value) { calc.writelong(proc.a2 - 4, value); proc.a2 -= 4; }
	void writebyte(byte value) { calc.writebyte(proc.a2 - 1, value); proc.a2 -= 1; } 
}

class a1predec extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return false; }
	String name() {	return "-(A1)"; }
	short readword(boolean sideeffects) { short value = calc.readword(proc.a1 - 2); if (sideeffects) proc.a1 -= 2; return value; }
	byte readbyte(boolean sideeffects) { byte value = calc.readbyte(proc.a1 - 1); if (sideeffects) proc.a1 -= 1; return value; } 
	int readlong(boolean sideeffects) { int value = calc.readlong(proc.a1 - 4); if (sideeffects) proc.a1 -= 4; return value; }
	void writeword(short value) { calc.writeword(proc.a1 - 2, value); proc.a1 -= 2; }
	void writelong(int value) { calc.writelong(proc.a1 - 4, value); proc.a1 -= 4; }
	void writebyte(byte value) { calc.writebyte(proc.a1 - 1, value); proc.a1 -= 1; } 
}

class a0predec extends jemumode
{
	boolean validsource() { return true; }
	boolean validdest() { return true; }
	boolean validcalc() { return false; }
	String name() {	return "-(A0)"; }
	short readword(boolean sideeffects) { short value = calc.readword(proc.a0 - 2); if (sideeffects) proc.a0 -= 2; return value; }
	byte readbyte(boolean sideeffects) { byte value = calc.readbyte(proc.a0 - 1); if (sideeffects) proc.a0 -= 1; return value; } 
	int readlong(boolean sideeffects) { int value = calc.readlong(proc.a0 - 4); if (sideeffects) proc.a0 -= 4; return value; }
	void writeword(short value) { calc.writeword(proc.a0 - 2, value); proc.a0 -= 2; }
	void writelong(int value) { calc.writelong(proc.a0 - 4, value); proc.a0 -= 4; }
	void writebyte(byte value) { calc.writebyte(proc.a0 - 1, value); proc.a0 -= 1; } 
}

class sr extends jemumode
{
	String name() { return "SR"; }
	short readword(boolean sideeffects) { return proc.getsr(); }
	byte readbyte(boolean sideeffects) { return (byte) (proc.getsr() & 0xFF); }
	void writeword(short value) { proc.setsr(value); }
	void writebyte(byte value) { proc.setsr((short) ((proc.getsr() & 0xFF00) | (value & 0xFF))); }
}