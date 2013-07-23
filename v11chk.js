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
	    //&& (0xFFFFFFFFFF00001B == -0xFFFFE5)
	    ;
};
