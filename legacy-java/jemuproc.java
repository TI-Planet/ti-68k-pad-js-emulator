// Basic emulation of 68K processor - calls into jemucalc to access memory / hardware.

import java.lang.*;

final public class jemuproc
{
	int d0, d1, d2, d3, d4, d5, d6, d7, a0, a1, a2, a3, a4, a5, a6, a7, pc;
	int a8; // A8 is whichever stack pointer is not in use, must be swapped on S bit change
	int ilevel; // processor interrupt level from SR (value 0-7, not shifted)
	boolean supervisor, trace, overflow, zero, carry, sign, extend; // other SR bits stored as flags
	jemucalc calc;
	jemuinst[] instructions = new jemuinst[65536];
	jemumode[] amodes = new jemumode[72]; // addressing mode table (mode in high 3 bits, reg in low 3 bits) plus constant fake modes
	int unknowncount = 0;
	int tracecount = 0;
	
	int dn(int n)
	{
		if (n == 0) return d0;
		if (n == 1) return d1;
		if (n == 2) return d2;
		if (n == 3) return d3;
		if (n == 4) return d4;
		if (n == 5) return d5;
		if (n == 6) return d6;
		return d7;
	}
	
	int an(int n)
	{
		if (n == 0) return a0;
		if (n == 1) return a1;
		if (n == 2) return a2;
		if (n == 3) return a3;
		if (n == 4) return a4;
		if (n == 5) return a5;
		if (n == 6) return a6;
		return a7;
	}
	
	short getsr()
	{
		short sr = (short)(ilevel << 8);
		if (supervisor) sr |= 0x2000;
		if (carry) sr |= 1;
		if (overflow) sr |= 2;
		if (zero) sr |= 4;
		if (sign) sr |= 8;
		if (extend) sr |= 0x10;
		if (trace) sr |= 0x8000;
		return sr;
	}
	
	void setsr(short newsr)
	{
		setccr((byte)(newsr & 0xFF));
		setsupervisor((newsr & 0x2000) != 0);
		sign = ((newsr & 8) != 0);
		extend = ((newsr & 0x10) != 0);
		trace = ((newsr & 0x8000) != 0);
		zero = ((newsr & 4) != 0);
		carry = ((newsr & 1) != 0);
		overflow = ((newsr & 2) != 0);
		ilevel = (newsr >> 8) & 7;
	}
	
	void setsupervisor(boolean newflag)
	{
		if (newflag != supervisor)
		{
			int temp = a7;
			a7 = a8;
			a8 = temp;
			supervisor = newflag;
		}
	}
	
	byte getccr()
	{
		return 0;
	}
	
	void setccr(short newccr)
	{
	}
	
	// Convert to hex.
	String to_hex(int number, int size)
	{
		String result = "";
		String digits = "0123456789ABCDEF";
		while (size-- > 0)
		{
			int digit = number & 0xF;
			number >>= 4;
			result = digits.substring(digit, digit + 1) + result;
		}
		return result;
	}
	
	// Print the current CPU status.
	void print_status()
	{
		System.out.println("---");
		short opcode = calc.readword(pc);
		System.out.println("PC=" + to_hex(pc, 8) + " SR=" + to_hex(getsr(), 4) + " opcode=" + to_hex(opcode, 4) + " " + instructions[((int)opcode) + 32768].disassemble(pc));
		String a = "Aregs";
		String d = "Dregs";
		for (int n = 0; n < 8; n++)
		{
			a += " " + to_hex(an(n), 8);
			d += " " + to_hex(dn(n), 8);
		}
		System.out.println(d);
		System.out.println(a);
	}
	
	// Assume we can run 2 instructions per OSC2 cycle, so 64 instructions between programmable interrupt counts (every 32 cycles).
	// We get about 744khz OSC2 rate here, which comes out to around 1.49 million instructions per second, which is fairly 
	// reasonable depending on your instruction mix.
	void run64()
	{
		try
		{
			for (int x = 0; x < 64; x++)
			{
				if (unknowncount >= 1) return;
				short opcode = calc.readword(pc);
				//if ((opcode & 0xF0C0) == 0xC0C0 && pc != 0x21761E && pc != 0x22181A) tracecount = 5;
				//if (opcode == (short)0xc109) tracecount = 5;
				//if (pc == 0xbfd0) tracecount = 100;
				if (tracecount > 0) 
				{
					print_status();			
					tracecount--;
					if (tracecount == 0) System.out.println("======== end of trace =========");
				}
				pc += 2;
				instructions[((int)opcode) + 32768].execute();
			}
		}
		catch (CPUException e)
		{
			fireexception(e.vector);
		}
	}
	
	void fireexception(int vector)
	{
		short oldsr = getsr();
		if (vector >= 25 && vector <= 30)
		{
			int reqlevel = vector - 24;
			if (reqlevel <= ilevel) return;
			ilevel = reqlevel;
		}
		
		setsupervisor(true); // go to supervisor mode
		if (vector == 2 || vector == 3)
		{
			a7 -= 8; // reserve space for the extra (not yet implemented) words pushed by address and bus errors
		}
		a7 -= 4; // push PC on supervisor stack
		calc.writelong(a7, pc);
		a7 -= 2; // push old SR on supervisor stack
		calc.writeword(a7, oldsr);
		pc = calc.readlong(vector * 4);
	}
	
	String decodecondition(int condition)
	{
		String s = "T F HILSHSLONEEQVCVSPLMIGELTGTLE";
		String result = s.substring(condition * 2, condition * 2 + 2);
		if (condition < 2)
			return result.substring(0, 1);
		return result;
	}
	
	boolean testcondition(int condition)
	{
		switch (condition)
		{
			case 0: return true; // T
			case 1: return false; // F
			case 2: return !carry & !zero; // HI
			case 3: return carry || zero; // LS
			case 4: return !carry; // CC / HS
			case 5: return carry; // CS / LO
			case 6: return !zero; // NE
			case 7: return zero; // EQ
			case 8: return !overflow; //VC
			case 9: return overflow; //VS
			case 10: return !sign; //PL
			case 11: return sign; //MI
			case 12: return sign == overflow; // GE
			case 13: return sign != overflow; // LT
			case 14: return (sign == overflow) && !zero; // GT
			case 15: return (sign != overflow) || zero; // LE
		}
		System.out.println("invalid condition!");
		return false;
	}
	
	int subl(int subtrahend, int minuend)
	{		
		int result = minuend - subtrahend;
		zero = result == 0;
		sign = result < 0;
		overflow = (minuend >= 0 && subtrahend < 0 && result < 0) || (minuend <= 0 && subtrahend > 0 && result >= 0); 
		carry = (subtrahend - 0x80000000) > (minuend - 0x80000000);
		return result;
	}
	
	short subw(short subtrahend, short minuend)
	{		
		short result = (short)(minuend - subtrahend);
		zero = result == 0;
		sign = result < 0;
		overflow = (minuend >= 0 && subtrahend < 0 && result < 0) || (minuend <= 0 && subtrahend > 0 && result >= 0); 
		carry = (subtrahend & 0xFFFF) > (minuend & 0xFFFF);
		return result;
	}
	
	byte subb(byte subtrahend, byte minuend)
	{		
		byte result = (byte)(minuend - subtrahend);
		zero = result == 0;
		sign = result < 0;
		overflow = (minuend >= 0 && subtrahend < 0 && result < 0) || (minuend <= 0 && subtrahend > 0 && result >= 0); 
		carry = (subtrahend & 0xFF) > (minuend & 0xFF);
		//System.out.println("Subtacting " + to_hex(subtrahend, 2) + " from " + to_hex(minuend, 2) + " result " + to_hex(result, 2));
		return result;
	}
	
	int addl(int x, int y)
	{		
		int result = x + y;
		zero = result == 0;
		sign = result < 0;
		overflow = (x >= 0 && y >= 0 && result < 0) || (x < 0 && y < 0 && result >= 0);
		carry = (x < 0 && y < 0) || ((x < 0 || y < 0) && (result >= 0));
		return result;
	}
	
	short addw(short x, short y)
	{		
		short result = (short) (x + y);
		zero = result == 0;
		sign = result < 0;
		overflow = (x >= 0 && y >= 0 && result < 0) || (x < 0 && y < 0 && result >= 0);
		carry = (x < 0 && y < 0) || ((x < 0 || y < 0) && (result >= 0));
		return result;
	}
	
	byte addb(byte x, byte y)
	{		
		byte result = (byte) (x + y);
		zero = result == 0;
		sign = result < 0;
		overflow = (x >= 0 && y >= 0 && result < 0) || (x < 0 && y < 0 && result >= 0);
		carry = (x < 0 && y < 0) || ((x < 0 || y < 0) && (result >= 0));
		return result;
	}


	// Intialize the processor.  Fills all of the handled entries in the instruction table with final instructions objects which
	// are hold the decoded information to execute the instrucion;
	jemuproc(jemucalc calc)
	{
		this.calc = calc;
		jemumode.fillmodes(amodes, this, calc);
		
		// Fill processor table with unimplemented instruction handlers.
		for (int opcode = 0; opcode < 65536; opcode++)
		{
			instructions[opcode] = new jemuinst();
		}
		
		// instructions with particular type of register as only specifiable paramter
		for (int mode = 0; mode < 8; mode++)
		{
			short moveuspopcode = (short) (0x4E60 | mode); // MOVE to USP
			instructions[moveuspopcode + 32768] = new movetousp(amodes[jemumode.AREG + mode]);
			short linkopcode = (short)(0x4E50 | mode); // LINK
			instructions[linkopcode + 32768] = new link(amodes[jemumode.AREG + mode]);
			short swapopcode = (short)(0x4840 | mode); // SWAP
			instructions[swapopcode + 32768] = new swap(amodes[mode]);
			short unlkopcode = (short)(0x4E58 | mode); // UNLK
			instructions[unlkopcode + 32768] = new unlk(amodes[jemumode.AREG + mode]);
			short extlopcode = (short)(0x48C0 | mode); // EXT.L
			instructions[extlopcode + 32768] = new extl(amodes[mode]);
			short extwopcode = (short)(0x4880 | mode); // EXT.W
			instructions[extwopcode + 32768] = new extw(amodes[mode]);
			moveuspopcode = (short) (0x4E68 | mode); // MOVE USP
			instructions[moveuspopcode + 32768] = new moveusp(amodes[jemumode.AREG + mode]);
		}
			
		// MOVE instruction
		for (short srcmode = 0; srcmode < 64; srcmode++)
		{
			jemumode src = amodes[srcmode];
			if (src.validsource())
			{
				for (short destmode = 0; destmode < 64; destmode++)
				{
					jemumode dest = amodes[destmode];
					if (dest.validdest())
					{
						// base opcode, ignores size
						short opcode = (short) (srcmode | ((destmode & 7) << 9) | ((destmode & 0x38) << 3));
						
						// MOVEA form
						if (dest.isareg())
						{
							short lopcode = (short)(opcode | 0x2000);
							instructions[lopcode + 32768] = new moveal(src, dest);
							short wopcode = (short)(opcode | 0x3000);
							instructions[wopcode + 32768] = new moveaw(src, dest);
						}
						// plain MOVE
						else
						{
							short wopcode = (short)(opcode | 0x3000);
							instructions[wopcode + 32768] = new movew(src, dest);
							if (!src.isareg())
							{	
								short bopcode = (short)(opcode | 0x1000);
								instructions[bopcode + 32768] = new moveb(src, dest);
							}
							short lopcode = (short)(opcode | 0x2000);
							instructions[lopcode + 32768] = new movel(src, dest);
						}
					}
				}
			}
		}					
		
		// immediate instructions with arbitrary destination
		for (short destmode = 0; destmode < 64; destmode++)
		{
			jemumode dest = amodes[destmode];
			if (dest.validdest() && !dest.isareg())
			{
				short opcode = destmode; // ORI.B
				instructions[opcode + 32768] = new orb(amodes[jemumode.IMMED], dest);
				short cmplocode = (short) (opcode | 0xC80); // CMPI.L
				instructions[cmplocode + 32768] = new cmpl(amodes[jemumode.IMMED], dest);
				short cmpwocode = (short) (opcode | 0xC40); // CMPI.W
				instructions[cmpwocode + 32768] = new cmpw(amodes[jemumode.IMMED], dest);
				short bclropcode = (short) (opcode | 0x880); // BCLR #
				instructions[bclropcode + 32768] = new bclri(dest, destmode <= 7);
				short bsetopcode = (short) (opcode | 0x8C0); // Bset #
				instructions[bsetopcode + 32768] = new bseti(dest, destmode <= 7);
				short andbopcode = (short) (0x200 | destmode); // ANDI.B
				instructions[andbopcode + 32768] = new andb(amodes[jemumode.IMMED], dest);
				short andwopcode = (short) (0x240 | destmode); // ANDI.W
				instructions[andwopcode + 32768] = new andw(amodes[jemumode.IMMED], dest);
				short andlopcode = (short) (0x280 | destmode); // ANDI.L
				instructions[andlopcode + 32768] = new andl(amodes[jemumode.IMMED], dest);
				short sublopcode = (short) (0x480 | destmode); // SUBI.L
				instructions[sublopcode + 32768] = new subl(amodes[jemumode.IMMED], dest);
				short cmpbocode = (short) (opcode | 0xC00); // CMPI.B
				instructions[cmpbocode + 32768] = new cmpb(amodes[jemumode.IMMED], dest);
				short orwopcode = (short) (0x40 | destmode); // ORI.W
				instructions[orwopcode + 32768] = new orw(amodes[jemumode.IMMED], dest);
				short subbopcode = (short) (0x400 | destmode); // SUBI.B
				instructions[subbopcode + 32768] = new subb(amodes[jemumode.IMMED], dest);
				short addbopcode = (short) (0x600 | destmode); // ADDI.B
				instructions[addbopcode + 32768] = new addb(amodes[jemumode.IMMED], dest);
				short addwopcode = (short) (0x640 | destmode); // ADDI.W
				instructions[addwopcode + 32768] = new addw(amodes[jemumode.IMMED], dest);
				short orlopcode = (short) (0x80 | destmode); // ORI.L
				instructions[orlopcode + 32768] = new orl(amodes[jemumode.IMMED], dest);
				short addlopcode = (short) (0x680 | destmode); // ADDI.L
				instructions[addlopcode + 32768] = new addl(amodes[jemumode.IMMED], dest);
				short eorwopcode = (short) (0xA40 | destmode); // EORI.W
				instructions[eorwopcode + 32768] = new eorw(amodes[jemumode.IMMED], dest);
				short bchgopcode = (short) (opcode | 0x840); // BCHG #
				instructions[bchgopcode + 32768] = new bchgi(dest, destmode <= 7);
				short eorbopcode = (short) (0xA00 | destmode); // EORI.B
				instructions[eorbopcode + 32768] = new eorb(amodes[jemumode.IMMED], dest);
				short subwopcode = (short) (0x440 | destmode); // SUBI.W
				instructions[subwopcode + 32768] = new subw(amodes[jemumode.IMMED], dest);
			}
			if (dest.validsource() && !dest.isareg() && destmode != 60)
			{
				short btstopcode = (short)(0x800 | destmode); // BTST #
				instructions[btstopcode + 32768] = new btsti(dest, destmode <= 7);
			}
		}
		
		// Branch instructions
		for (int condition = 0; condition < 16; condition++)
		{
			for (int offset = -128; offset < 128; offset++)
			{
				short opcode = (short) (0x6000 | (condition << 8) | (offset & 0xFF));
				if (offset == 0)
				{
					if (condition == 1)
					{
						instructions[opcode + 32768] = new bsrw();
					}
					else
					{
						instructions[opcode + 32768] = new bccw(condition);
					}
				}
				else
				{
					if (condition == 1)
					{
						instructions[opcode + 32768] = new bsrs((byte) offset);
					}
					else
					{
						instructions[opcode + 32768] = new bccs(condition, (byte) offset);
					}
				}
			}
		}
		
		// DBcc instructions
		for (int condition = 0; condition < 16; condition++)
		{
			for (int reg = 0; reg < 8; reg++)
			{
				jemumode mode = amodes[reg];
				short opcode = (short) (0x50C8 | reg | (condition << 8)); // note Sybex book has wrong first nibble of this opcode!
				instructions[opcode + 32768] = new dbcc(condition, mode);
			}
		}
		
		// Scc instructions
		for (int condition = 0; condition < 16; condition++)
		{
			for (int reg = 0; reg < 64; reg++)
			{
				jemumode mode = amodes[reg];
				if (mode.validdest() && !mode.isareg())
				{
					short opcode = (short) (0x50C0 | reg | (condition << 8)); // note Sybex book has wrong first nibble of this opcode!
					instructions[opcode + 32768] = new scc(condition, mode);
				}
			}
		}
		
		// LEA instruction
		for (int destreg = 0; destreg < 8; destreg++)
		{
			jemumode dest = amodes[destreg + 8];
			if (dest.validdest())
			{
				for (int srcmode = 0; srcmode < 64; srcmode++)
				{
					jemumode src = amodes[srcmode];
					if (src.validcalc())
					{
						short opcode = (short) (0x41C0 | srcmode | (destreg << 9));
						instructions[opcode + 32768] = new lea(src, dest);
					}
				}
			}
		}
		
		// unique instructions
		instructions[0x4e71 + 32768] = new nop(); // NOP
		instructions[0x4e75 + 32768] = new rts(); // RTS
		instructions[0x4e73 + 32768] = new rte(); // RTE
		instructions[0x27C + 32768] = new andw(amodes[jemumode.IMMED], amodes[jemumode.SR]); // ANDI to SR
		instructions[0x23C + 32768] = new andw(amodes[jemumode.IMMED], amodes[jemumode.SR]); // ANDI to CCR
		instructions[0x4e72 + 32768] = new nop(); // STOP (treat like NOP for now)
		
		// Dreg dest instructions
		for (int destreg = 0; destreg < 8; destreg++)
		{
			jemumode dest = amodes[destreg];
			for (int srcmode = 0; srcmode < 64; srcmode++)
			{
				jemumode src = amodes[srcmode];
				if (src.validsource())
				{
					short cmpbopcode = (short) (0xB000 | srcmode | (destreg << 9)); // CMP.B
					instructions[cmpbopcode + 32768] = new cmpb(src, dest);
					short cmplopcode = (short) (0xB080 | srcmode | (destreg << 9)); // CMP.L
					instructions[cmplopcode + 32768] = new cmpl(src, dest);
					short addlopcode = (short) (0xD080 | srcmode | (destreg << 9)); // ADD.L
					instructions[addlopcode + 32768] = new addl(src, dest);
					short cmpwopcode = (short) (0xB040 | srcmode | (destreg << 9)); // CMP.W
					instructions[cmpwopcode + 32768] = new cmpw(src, dest);
					short sublopcode = (short) (0x9080 | srcmode | (destreg << 9)); // SUB.L
					instructions[sublopcode + 32768] = new subl(src, dest);
					short addwopcode = (short) (0xD040 | srcmode | (destreg << 9)); // ADD.W
					instructions[addwopcode + 32768] = new addw(src, dest);
					short subwopcode = (short) (0x9040 | srcmode | (destreg << 9)); // SUB.W
					instructions[subwopcode + 32768] = new subw(src, dest);
					short subbopcode = (short) (0x9000 | srcmode | (destreg << 9)); // SUB.B
					instructions[subbopcode + 32768] = new subb(src, dest);
					short addbopcode = (short) (0xD000 | srcmode | (destreg << 9)); // ADD.B
					instructions[addbopcode + 32768] = new addb(src, dest);
				}
				if (src.validsource() && !src.isareg())
				{
					short andbopcode = (short) (0xC000 | srcmode | (destreg << 9)); // AND.B
					instructions[andbopcode + 32768] = new andb(src, dest);
					short orwopcode = (short) (0x8040 | srcmode | (destreg << 9)); // OR.W
					instructions[orwopcode + 32768] = new orw(src, dest);
					short mulsopcode = (short) (0xC1C0 | srcmode | (destreg << 9)); // MULS
					instructions[mulsopcode + 32768] = new muls(src, dest);
					short muluopcode = (short) (0xC0C0 | srcmode | (destreg << 9)); // MULU
					instructions[muluopcode + 32768] = new mulu(src, dest);
					short andwopcode = (short) (0xC040 | srcmode | (destreg << 9)); // AND.W
					instructions[andwopcode + 32768] = new andw(src, dest);
					short orbopcode = (short) (0x8000 | srcmode | (destreg << 9)); // OR.B
					instructions[orbopcode + 32768] = new orb(src, dest);
					short andlopcode = (short) (0xC080 | srcmode | (destreg << 9)); // AND.L
					instructions[andlopcode + 32768] = new andl(src, dest);
					short divuopcode = (short) (0x80C0 | srcmode | (destreg << 9)); // DIVU
					instructions[divuopcode + 32768] = new divu(src, dest);
					short divsopcode = (short) (0x81C0 | srcmode | (destreg << 9)); // DIVS
					instructions[divsopcode + 32768] = new divs(src, dest);
					short orlopcode = (short) (0x8080 | srcmode | (destreg << 9)); // OR.L
					instructions[orlopcode + 32768] = new orl(src, dest);
				}
			}
		}		
		
		// Dreg source instructions
		for (int srcreg = 0; srcreg < 8; srcreg++)
		{
			jemumode src = amodes[srcreg];
			for (int destmode = 0; destmode < 64; destmode++)
			{
				jemumode dest = amodes[destmode];
				if (dest.validdest() && destmode >= 16) // most dreg source variants don't allow register dest (should use dreg dest or areg dest version isntead)
				{
					short andbopcode = (short) (0xC100 | destmode | (srcreg << 9)); // AND.B
					instructions[andbopcode + 32768] = new andb(src, dest);		
					short addwopcode = (short) (0xD140 | destmode | (srcreg << 9)); // ADD.W
					instructions[addwopcode + 32768] = new addw(src, dest);
					short orbopcode = (short) (0x8100 | destmode | (srcreg << 9)); // OR.B
					instructions[orbopcode + 32768] = new orb(src, dest);
					short orlopcode = (short) (0x8180 | destmode | (srcreg << 9)); // OR.L
					instructions[orlopcode + 32768] = new orl(src, dest);
					short andlopcode = (short) (0xC180 | destmode | (srcreg << 9)); // AND.L
					instructions[andlopcode + 32768] = new andl(src, dest);		
					short addlopcode = (short) (0xD180 | destmode | (srcreg << 9)); // ADD.L
					instructions[addlopcode + 32768] = new addl(src, dest);
					short sublopcode = (short) (0x9180 | destmode | (srcreg << 9)); // SUB.L
					instructions[sublopcode + 32768] = new subl(src, dest);
					short subwopcode = (short) (0x9140 | destmode | (srcreg << 9)); // SUB.W
					instructions[subwopcode + 32768] = new subw(src, dest);
					short subbopcode = (short) (0x9100 | destmode | (srcreg << 9)); // SUB.B
					instructions[subbopcode + 32768] = new subb(src, dest);
					short addbopcode = (short) (0xD100 | destmode | (srcreg << 9)); // ADD.B
					instructions[addbopcode + 32768] = new addb(src, dest);
					short andwopcode = (short) (0xC140 | destmode | (srcreg << 9)); // AND.W
					instructions[andwopcode + 32768] = new andw(src, dest);		
					short orwopcode = (short) (0x8140 | destmode | (srcreg << 9)); // OR.W
					instructions[orwopcode + 32768] = new orw(src, dest);
				}
				if (dest.validsource() && (destmode <= 7 || destmode >= 16) && destmode != jemumode.IMMED) // BTST allows any dest but An and immediate
				{
					short btstopcode = (short) (0x100 | destmode | (srcreg << 9)); // BTST
					instructions[btstopcode + 32768] = new btst(src, dest, destmode <= 7);
				}
				if (dest.validdest() && (destmode <= 7 || destmode >= 16)) // other bit operations allow the normal dests + DN
				{
					short bsetopcode = (short) (0x1C0 | destmode | (srcreg << 9)); // BSET
					instructions[bsetopcode + 32768] = new bset(src, dest, destmode <= 7);
					short bclropcode = (short) (0x180 | destmode | (srcreg << 9)); // BCLR
					instructions[bclropcode + 32768] = new bclr(src, dest, destmode <= 7);
					short eorlopcode = (short) (0xB180 | destmode | (srcreg << 9)); // EOR.L
					instructions[eorlopcode + 32768] = new eorl(src, dest);
					short eorwopcode = (short) (0xB140 | destmode | (srcreg << 9)); // EOR.W
					instructions[eorwopcode + 32768] = new eorw(src, dest);
					short eorbopcode = (short) (0xB100 | destmode | (srcreg << 9)); // EOR.B
					instructions[eorbopcode + 32768] = new eorb(src, dest);
				}
			}
		}
		
		// Quick arithmetic instructions
		for (int destreg = 0; destreg < 64; destreg++)
		{
			jemumode dest = amodes[destreg];
			if (dest.validdest())
			{
				for (int imm = 0; imm < 8; imm++)
				{
					jemumode src = amodes[jemumode.CONSTANT + imm];
					short subqlopcode = (short) (0x5180 | (imm << 9) | destreg); // SUBQ.L
					instructions[subqlopcode + 32768] = new subl(src, dest);
					short addqlopcode = (short) (0x5080 | (imm << 9) | destreg); // ADDQ.L
					instructions[addqlopcode + 32768] = new addl(src, dest);
					if (dest.isareg())
					{
						short subqwopcode = (short) (0x5140 | (imm << 9) | destreg); // SUBQ.W
						instructions[subqwopcode + 32768] = new subaw(src, dest);
						short addqwopcode = (short) (0x5040 | (imm << 9) | destreg); // ADDQ.W
						instructions[addqwopcode + 32768] = new addaw(src, dest);
					}
					else
					{					
						short subqwopcode = (short) (0x5140 | (imm << 9) | destreg); // SUBQ.W
						instructions[subqwopcode + 32768] = new subw(src, dest);
						short addqwopcode = (short) (0x5040 | (imm << 9) | destreg); // ADDQ.W
						instructions[addqwopcode + 32768] = new addw(src, dest);
						short addqbopcode = (short) (0x5000 | (imm << 9) | destreg); // ADDQ.B
						instructions[addqbopcode + 32768] = new addb(src, dest);
						short subqbopcode = (short) (0x5100 | (imm << 9) | destreg); // SUBQ.B
						instructions[subqbopcode + 32768] = new subb(src, dest);
					}
				}
			}
		}
			
		// Areg dest instructions
		for (int destreg = 0; destreg < 8; destreg++)
		{
			jemumode dest = amodes[jemumode.AREG + destreg];
			for (int srcmode = 0; srcmode < 64; srcmode++)
			{
				jemumode src = amodes[srcmode];
				if (src.validsource())
				{
					short subalopcode = (short) (0x91C0 | srcmode | (destreg << 9)); // SUBA.L
					instructions[subalopcode + 32768] = new subal(src, dest);
					short cmpalopcode = (short) (0xB1C0 | srcmode | (destreg << 9)); // CMPA.L
					instructions[cmpalopcode + 32768] = new cmpl(src, dest);
					short subawopcode = (short) (0x90C0 | srcmode | (destreg << 9)); // SUBA.W
					instructions[subawopcode + 32768] = new subaw(src, dest);
					short addawopcode = (short) (0xD0C0 | srcmode | (destreg << 9)); // ADDA.W
					instructions[addawopcode + 32768] = new addaw(src, dest);
					short addalopcode = (short) (0xD1C0 | srcmode | (destreg << 9)); // ADDA.L
					instructions[addalopcode + 32768] = new addal(src, dest);
					short cmpawopcode = (short) (0xB0C0 | srcmode | (destreg << 9)); // CMPA.W
					instructions[cmpawopcode + 32768] = new cmpaw(src, dest);
				}
			}
		}
		
		// Single operand instructions
		for (int srcmode = 0; srcmode < 64; srcmode++)
		{
			jemumode mode = amodes[srcmode];
			if (mode.validdest())
			{
				short clrlopcode = (short) (0x4280 + srcmode); // CLR.L
				instructions[clrlopcode + 32768] = new clrl(mode);
				short clrwopcode = (short) (0x4240 + srcmode); // CLR.W
				instructions[clrwopcode + 32768] = new clrw(mode);
			}
			if (mode.validdest() && !mode.isareg())
			{
				short clrbopcode = (short) (0x4200 + srcmode); // CLR.B
				instructions[clrbopcode + 32768] = new clrb(mode);
				short notlopcode = (short) (0x4680 + srcmode); // NOT.L
				instructions[notlopcode + 32768] = new notl(mode);
				short negwopcode = (short) (0x4440 + srcmode); // NEG.W
				instructions[negwopcode + 32768] = new negw(mode);
				short notbopcode = (short) (0x4600 + srcmode); // NOT.B
				instructions[notbopcode + 32768] = new notb(mode);
				short negbopcode = (short) (0x4400 + srcmode); // NEG.B
				instructions[negbopcode + 32768] = new negb(mode);
				short notwopcode = (short) (0x4640 + srcmode); // NOT.W
				instructions[notwopcode + 32768] = new notw(mode);
				short neglopcode = (short) (0x4480 + srcmode); // NEG.L
				instructions[neglopcode + 32768] = new negl(mode);
				short opcode = (short)(0x40C0 | srcmode); // MOVE SR
				instructions[opcode + 32768] = new movesr(mode);
				opcode = (short)(0x4800 | srcmode); // NBCD
				instructions[opcode + 32768] = new nbcd(mode);
				
			}
			if (mode.validcalc())
			{
				short jmpopcode = (short) (0x4EC0 + srcmode); // JMP
				instructions[jmpopcode + 32768] = new jmp(mode);
				short jsropcode = (short) (0x4E80 + srcmode); // JSR
				instructions[jsropcode + 32768] = new jsr(mode);
				short peaopcode = (short) (0x4840 + srcmode); // PEA
				instructions[peaopcode + 32768] = new pea(mode);
			}
			if (mode.validsource() && !mode.isareg()) 
			{
				short opcode = (short)(0x46C0 | srcmode); // MOVE to SR
				instructions[opcode + 32768] = new movetosr(mode);
				opcode = (short)(0x44C0 | srcmode); // MOVE to CCR
				instructions[opcode + 32768] = new movetoccr(mode);
				short tstlopcode = (short) (0x4A80 + srcmode); // TST.L
				instructions[tstlopcode + 32768] = new tstl(mode);
				short tstwopcode = (short) (0x4A40 + srcmode); // TST.W
				instructions[tstwopcode + 32768] = new tstw(mode);
				short tstbopcode = (short) (0x4A00 + srcmode); // TST.B
				instructions[tstbopcode + 32768] = new tstb(mode);
			}
			if (mode.validdest() && srcmode >= 16) // rotates in arbitrary EA form cannot use any register directory
			{
				short opcode = (short)(0xE5C0 | srcmode); // ROXL
				instructions[opcode + 32768] = new roxlw(amodes[jemumode.CONSTANT + 1], mode);
			}
		}
		
		// rotate instructions (immed/reg source, dreg dest)
		for (int destreg = 0; destreg < 8; destreg++)
		{
			jemumode dest = amodes[destreg];
			for (int imm = 0; imm < 8; imm++)
			{
				for (int t = 0; t < 2; t++)
				{
					jemumode src = amodes[imm + (1 - t) * 64];
					short rorwopcode = (short) (0xE058 | destreg | (imm << 9) | (t << 5)); // ROR.W
					instructions[rorwopcode + 32768] = new rorw(src, dest);
					short lsllopcode = (short) (0xE188 | destreg | (imm << 9) | (t << 5)); // LSL.L
					instructions[lsllopcode + 32768] = new lsll(src, dest);				
					short lsrlopcode = (short) (0xE088 | destreg | (imm << 9) | (t << 5)); // LSR.L
					instructions[lsrlopcode + 32768] = new lsrl(src, dest);		
					short asrlopcode = (short) (0xE080 | destreg | (imm << 9) | (t << 5)); // ASR.L
					instructions[asrlopcode + 32768] = new asrl(src, dest);		
					short lslwopcode = (short) (0xE148 | destreg | (imm << 9) | (t << 5)); // LSL.W
					instructions[lslwopcode + 32768] = new lslw(src, dest);
					short lsrbopcode = (short) (0xE008 | destreg | (imm << 9) | (t << 5)); // LSR.B
					instructions[lsrbopcode + 32768] = new lsrb(src, dest);	
					short asrwopcode = (short) (0xE040 | destreg | (imm << 9) | (t << 5)); // ASR.W
					instructions[asrwopcode + 32768] = new asrw(src, dest);		
					short lslbopcode = (short) (0xE108 | destreg | (imm << 9) | (t << 5)); // LSL.B
					instructions[lslbopcode + 32768] = new lslb(src, dest);	
					short rorbopcode = (short) (0xE018 | destreg | (imm << 9) | (t << 5)); // ROR.B
					instructions[rorbopcode + 32768] = new rorb(src, dest);				
					short aslwopcode = (short) (0xE140 | destreg | (imm << 9) | (t << 5)); // ASL.W
					instructions[aslwopcode + 32768] = new aslw(src, dest);
					short lsrwopcode = (short) (0xE048 | destreg | (imm << 9) | (t << 5)); // LSR.W
					instructions[lsrwopcode + 32768] = new lsrw(src, dest);	
					short rorlopcode = (short) (0xE098 | destreg | (imm << 9) | (t << 5)); // ROR.L
					instructions[rorlopcode + 32768] = new rorl(src, dest);
					short rollopcode = (short) (0xE198 | destreg | (imm << 9) | (t << 5)); // ROL.L
					instructions[rollopcode + 32768] = new roll(src, dest);
					short rolwopcode = (short) (0xE158 | destreg | (imm << 9) | (t << 5)); // ROL.W
					instructions[rolwopcode + 32768] = new rolw(src, dest);
					short roxllopcode = (short) (0xE190 | destreg | (imm << 9) | (t << 5)); // ROXL.L
					instructions[roxllopcode + 32768] = new roxll(src, dest);
				}
			}
		}
		
		// MOVEQ instruction
		for (int destreg = 0; destreg < 8; destreg++)
		{
			jemumode dest = amodes[destreg];
			for (int value = -128; value <= 127; value++)
			{
				short moveqopcode = (short) (0x7000 | (destreg << 9) | (value & 0xFF));
				instructions[moveqopcode + 32768] = new moveq(value, dest);
			}
		}
		
		// MOVEM instruction
		for (int destmode = 0; destmode < 64; destmode++)
		{
			jemumode dest = amodes[destmode];
			// regs to memory, predec		
			if (dest.validdest() && destmode >= jemumode.PREDEC && destmode < jemumode.AREG_OFFSET)
			{
				short lopcode = (short) (0x48C0 | destmode);
				short wopcode = (short) (0x4880 | destmode);
				instructions[lopcode + 32768] = new movemlpredec(dest); // MOVEM.L 
				instructions[wopcode + 32768] = new movemwpredec(dest); // MOVEM.W
			}
			// regs to memory, other
			if (dest.validcalc() && dest.validdest())
			{
				short lopcode = (short) (0x48C0 | destmode);
				short wopcode = (short) (0x4880 | destmode);
				instructions[lopcode + 32768] = new movemltomem(dest); // MOVEM.L 		
			}
			// memory to regs, other
			if (dest.validcalc() && dest.validsource())
			{
				short lopcode = (short) (0x4CC0 | destmode);
				short wopcode = (short) (0x4C80 | destmode);
				instructions[lopcode + 32768] = new movemltoregs(dest); // MOVEM.L 		
			}
			// memory to regs, postinc
			if (destmode >= jemumode.POSTINC && destmode < jemumode.PREDEC)
			{
				short lopcode = (short) (0x4CC0 | destmode);
				short wopcode = (short) (0x4C80 | destmode);
				instructions[lopcode + 32768] = new movemlpostinc(dest); // MOVEM.L 	
				instructions[wopcode + 32768] = new movemwpostinc(dest); // MOVEM.W					
			}
		}
		
		// TRAP instruction
		for (int v = 0; v < 16; v++)
		{
			short opcode = (short) (0x4E40 | v);
			instructions[opcode + 32768] = new trap(v);
		}
		
		// instructions using any register pair with limited addressing modes
		for (int regdest = 0; regdest < 8; regdest++)
		{			
			for (int regsrc = 0; regsrc < 8; regsrc++)
			{
				// CMPM.B
				jemumode pisrc = amodes[jemumode.POSTINC + regsrc];
				jemumode pidest = amodes[jemumode.POSTINC + regdest];
				short bopcode = (short) (0xB108 | (regdest << 9) | regsrc);
				instructions[bopcode + 32768] = new cmpb(pisrc, pidest);
				
				// EXG
				jemumode dsrc = amodes[regsrc];
				jemumode ddest = amodes[regdest];
				jemumode asrc = amodes[regsrc + jemumode.AREG];
				jemumode adest = amodes[regdest + jemumode.AREG];
				short exgopcode = (short) (0xC140 | (regsrc << 9) | regdest);
				instructions[exgopcode + 32768] = new exg(dsrc, ddest);
				exgopcode = (short) (0xC148 | (regsrc << 9) | regdest);
				instructions[exgopcode + 32768] = new exg(asrc, adest);
				exgopcode = (short) (0xC188 | (regsrc << 9) | regdest);
				instructions[exgopcode + 32768] = new exg(dsrc, adest);
			}
		}
		
		// instructions using dn,dn or -(an),-(an)
		for (int regdest = 0; regdest < 8; regdest++)
		{			
			for (int regsrc = 0; regsrc < 8; regsrc++)
			{
				for (int mode = 0; mode <= 1; mode++)
				{
					jemumode src = amodes[regsrc + mode * jemumode.PREDEC];
					jemumode dest = amodes[regdest + mode * jemumode.PREDEC];
					short opcode = (short) (0xC100 | (mode << 3) | (regdest << 9) | regsrc); // ABCD
					instructions[opcode + 32768] = new abcd(src, dest);
					opcode = (short) (0x8100 | (mode << 3) | (regdest << 9) | regsrc); // SBCD
					instructions[opcode + 32768] = new sbcd(src, dest);
					opcode = (short) (0x9180 | (mode << 3) | (regdest << 9) | regsrc); // SUBX.L
					instructions[opcode + 32768] = new subxl(src, dest);
				}				
			}
		}

		// Fill in misc info for all the instructions.
		int unhandled = 0;
		for (int opcode = 0; opcode < 65536; opcode++)
		{
			instructions[opcode].opcode = (short) (opcode - 32768);
			instructions[opcode].calc = calc;
			instructions[opcode].proc = this;
			if (instructions[opcode].disassemble(0) == "UNKNOWN") unhandled++;
		}
		
		System.out.println("Number of unknown opcodes = " + unhandled);
	}
}

class jemuinst
{	
	void execute()
	{
		proc.unknowncount++;
		System.out.println("Unimplemented instuction " + disassemble(proc.pc) + " at " + proc.to_hex(proc.pc - 2, 8));
	}
	
	String disassemble(int address)
	{
		return "UNKNOWN";
	}
	
	short opcode;
	jemucalc calc;
	jemuproc proc;
}

class movetosr extends jemuinst
{
	jemumode src;
	
	String disassemble(int address)
	{
		return "MOVE " + src.name() + ",SR";
	}
	
	void execute()
	{
		proc.setsr(src.readword(true));
	}
	
	movetosr(jemumode src)
	{
		this.src = src;
	}
}

class moveal extends jemuinst
{
	jemumode src;
	jemumode dest;
	
	String disassemble(int addrress)
	{
		return "MOVEA.L " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		dest.writelong(src.readlong(true));
	}
	
	moveal(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

class movew extends jemuinst
{
	jemumode src;
	jemumode dest;
	
	String disassemble(int addrress)
	{
		return "MOVE.W " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		short value = src.readword(true);
		proc.overflow = proc.carry = false;
		proc.sign = value < 0;
		proc.zero = value == 0;
		dest.writeword(value);
	}
	
	movew(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

class orb extends jemuinst
{
	jemumode src;
	jemumode dest;
	
	String disassemble(int addrress)
	{
		return "OR.B " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		byte value = src.readbyte(true);
		value |= dest.readbyte(false);
		proc.overflow = proc.carry = false;
		proc.sign = value < 0;
		proc.zero = value == 0;
		dest.writebyte(value);
	}
	
	orb(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

class moveb extends jemuinst
{
	jemumode src;
	jemumode dest;
	
	String disassemble(int addrress)
	{
		return "MOVE.B " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		byte value = src.readbyte(true);
		proc.overflow = proc.carry = false;
		proc.sign = value < 0;
		proc.zero = value == 0;
		dest.writebyte(value);
	}
	
	moveb(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

class movel extends jemuinst
{
	jemumode src;
	jemumode dest;
	
	String disassemble(int addrress)
	{
		return "MOVE.L " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int value = src.readlong(true);
		proc.overflow = proc.carry = false;
		proc.sign = value < 0;
		proc.zero = value == 0;
		dest.writelong(value);
	}
	
	movel(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class btsti extends jemuinst
{
	jemumode dest;
	boolean dreg;
	
	String disassemble(int addrress)
	{
		return (dreg ? "BTST #n," : "BTST #nn,") + dest.name();
	}
	
	void execute()
	{
		byte imm = calc.readbyte(proc.pc + 1);
		proc.pc += 2;
		if (dreg)
		{
			int bit = 1 << (imm & 31);
			int value = dest.readlong(true);
			proc.zero = (value & bit) == 0;
		}
		else
		{
			int bit = 1 << (imm & 7);
			byte value = dest.readbyte(true);
			proc.zero = (value & bit) == 0;
		}
	}
	
	btsti(jemumode dest, boolean dreg)
	{
		this.dest = dest;
		this.dreg = dreg;
	}
}

final class bccs extends jemuinst
{
	int condition;
	byte offset;
	
	String disassemble(int address)
	{
		if (condition == 0) return "BRA.S";
		return "B" + proc.decodecondition(condition) + ".S";
	}
	
	void execute()
	{
		if (proc.testcondition(condition)) proc.pc += offset;
	}
	
	bccs(int condition, byte offset)
	{
		this.condition = condition;
		this.offset = offset;
	}
}

class bccw extends jemuinst
{
	int condition;
	
	String disassemble(int address)
	{
		if (condition == 0) return "BRA.W";
		return "B" + proc.decodecondition(condition) + ".W";
	}
	
	void execute()
	{
		short offset = calc.readword(proc.pc);
		proc.pc += proc.testcondition(condition) ? offset : 2;
	}
	
	bccw(int condition)
	{
		this.condition = condition;
	}
}
	
final class cmpl extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "CMP.L " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int srcval = src.readlong(true);
		proc.subl(srcval, dest.readlong(true));
	}
	
	cmpl(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class cmpw extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "CMP.W " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		short srcval = src.readword(true);
		proc.subw(srcval, dest.readword(true));
	}
	
	cmpw(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class lea extends jemuinst
{
	jemumode src;
	jemumode dest;
	
	String disassemble(int address)
	{
		return "LEA " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		dest.writelong(src.calcaddress());
	}
	
	lea(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

class bclri extends jemuinst
{
	jemumode dest;
	boolean dreg;
	
	String disassemble(int addrress)
	{
		return (dreg ? "BCLR #n," : "BCLR #nn,") + dest.name();
	}
	
	void execute()
	{
		byte imm = calc.readbyte(proc.pc + 1);
		proc.pc += 2;
		if (dreg)
		{
			int bit = 1 << (imm & 31);
			int value = dest.readlong(false);
			proc.zero = (value & bit) == 0;
			value = value & (0xFFFFFFFF - bit);
			dest.writelong(value);
		}
		else
		{
			int bit = 1 << (imm & 7);
			byte value = dest.readbyte(false);
			proc.zero = (value & bit) == 0;
			value = (byte)(value & (0xFF - bit));
			dest.writebyte(value);
		}
	}
	
	bclri(jemumode dest, boolean dreg)
	{
		this.dest = dest;
		this.dreg = dreg;
	}
}

final class nop extends jemuinst
{
	String disassemble(int address) { return "NOP"; }
	void execute() {}
}

final class bseti extends jemuinst
{
	jemumode dest;
	boolean dreg;
	
	String disassemble(int addrress)
	{
		return (dreg ? "BSET #n," : "BSET #nn,") + dest.name();
	}
	
	void execute()
	{
		byte imm = calc.readbyte(proc.pc + 1);
		proc.pc += 2;
		if (dreg)
		{
			int bit = 1 << (imm & 31);
			int value = dest.readlong(false);
			proc.zero = (value & bit) == 0;
			value = value | bit;
			dest.writelong(value);
		}
		else
		{
			int bit = 1 << (imm & 7);
			byte value = dest.readbyte(false);
			proc.zero = (value & bit) == 0;
			value = (byte)(value | bit);
			dest.writebyte(value);
		}
	}
	
	bseti(jemumode dest, boolean dreg)
	{
		this.dest = dest;
		this.dreg = dreg;
	}
}

class dbcc extends jemuinst
{
	jemumode reg;
	int condition;
	
	String disassemble(int address)
	{
		if (condition == 0) return "DBRA " + reg.name();
		return "DB" + proc.decodecondition(condition)+ " " + reg.name();
	}
	
	void execute()
	{
		short offset = calc.readword(proc.pc);
		if (proc.testcondition(condition))
			proc.pc += 2;
		else
		{
			short value = reg.readword(false);
			reg.writeword(--value);
			proc.pc += (value == -1) ? 2 : calc.readword(proc.pc);;
		}
	}
	
	dbcc( int condition, jemumode mode)
	{
		this.reg = mode;
		this.condition = condition;
	}
}

final class cmpb extends jemuinst
{
	jemumode src;
	jemumode dest;
	
	String disassemble(int address)
	{
		return "CMP.B " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		byte srcval = src.readbyte(true);
		proc.subb(srcval, dest.readbyte(true));
	}
	
	cmpb(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class rorw extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int address)
	{
		return "ROR.W " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int shift = src.readlong(true) & 63;
		short value = dest.readword(false);
		proc.overflow = false;
		proc.carry = false;
		while (shift-- > 0)
		{
			proc.carry = (value & 1) == 1; 
			value >>>= 1;
			value &= 0x7FFF;
			if (proc.carry) value |= 0x80;
		}
		proc.zero = value == 0;
		proc.sign = value < 0;
		dest.writeword(value);
	}
	
	rorw(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class notl extends jemuinst
{
	jemumode mode;
	
	String disassemble(int address)
	{
		return "NOT.L " + mode.name();
	}
	
	void execute()
	{
		int value = mode.readlong(false);
		value ^= 0xFFFFFFFF;
		mode.writelong(value);
		proc.overflow = proc.carry = false;
		proc.zero = value == 0;
		proc.sign = value < 0;
	}
	
	notl(jemumode mode)
	{
		this.mode = mode;
	}
}

class clrl extends jemuinst
{
	jemumode mode;
	
	String disassemble(int address)
	{
		return "CLR.L " + mode.name();
	}
	
	void execute()
	{
		mode.writelong(0);
		proc.zero = true;
		proc.sign = proc.overflow = proc.carry = false;
	}
	
	clrl(jemumode mode)
	{
		this.mode = mode;
	}
}

final class moveq extends jemuinst
{
	int value;
	jemumode dest;
	
	String disassemble(int address)
	{
		return "MOVEQ #" + value + "," + dest.name();
	}
	
	void execute()
	{
		dest.writelong(value);
		proc.carry = proc.overflow = false;
		proc.zero = value == 0;
		proc.sign = value < 0;
	}
	
	moveq(int value, jemumode dest)
	{
		this.value = value;
		this.dest = dest;
	}
}

final class subal extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "SUBA.L " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int srcval = src.readlong(true);
		int result = dest.readlong(false) - srcval;
		dest.writelong(result);
	}
	
	subal(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

class andb extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "AND.B " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		byte result = src.readbyte(true);
		result &= dest.readbyte(false);
		dest.writebyte(result);
		proc.carry = proc.overflow = false;
		proc.sign = result < 0;
		proc.zero = result == 0;
	}
	
	andb(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

class movetousp extends jemuinst
{
	jemumode src;
	
	String disassemble(int address)
	{
		return "MOVE " + src.name() + ",USP";
	}
	
	void execute()
	{
		proc.a8 = src.readlong(true);
	}
	
	movetousp(jemumode src)
	{
		this.src = src;
	}
}

class bsrs extends jemuinst
{
	byte offset;
	
	String disassemble(int address)
	{
		return "BSR.S";
	}
	
	void execute()
	{
		proc.a7 -= 4;
		calc.writelong(proc.a7, proc.pc);
		//calc.protectlong(proc.a7);
		proc.pc += offset;
	}
	
	bsrs(byte offset)
	{
		this.offset = offset;
	}
}

class bsrw extends jemuinst
{
	int condition;
	
	String disassemble(int address)
	{
		return "BSR.W";
	}
	
	void execute()
	{	
		short offset = calc.readword(proc.pc);
		proc.a7 -= 4;
		calc.writelong(proc.a7, proc.pc + 2);
		//calc.protectlong(proc.a7);
		proc.pc += offset;	
	}
}

class jmp extends jemuinst
{
	jemumode mode;
	
	String disassemble(int address)
	{
		return "JMP " + mode.name();
	}
	
	void execute()
	{
		proc.pc = mode.calcaddress();
	}
	
	jmp(jemumode mode)
	{
		this.mode = mode;
	}
}

class movemlpredec extends jemuinst
{
	jemumode dest;
	
	String disassemble(int address)
	{
		return "MOVEM.L regs," + dest.name();
	}
	
	void execute()
	{
		short mask = calc.readword(proc.pc);
		proc.pc += 2;
		for (int a = 7; a >= 0; a--)
		{
			if ((mask & 1) != 0) dest.writelong(proc.an(a));
			mask >>= 1;
		}
		for (int d = 7; d >= 0; d--)
		{
			if ((mask & 1) != 0) dest.writelong(proc.dn(d));
			mask >>= 1;
		}
	}
	
	movemlpredec(jemumode mode)
	{
		this.dest = mode;
	}
}

final class subl extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "SUB.L " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int srcval = src.readlong(true);
		dest.writelong(proc.subl(srcval, dest.readlong(false)));
		proc.extend = proc.carry;
	}
	
	subl(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class jsr extends jemuinst
{
	jemumode mode;
	
	String disassemble(int address)
	{
		return "JSR " + mode.name();
	}
	
	void execute()
	{
		int newpc = mode.calcaddress();
		proc.a7 -= 4;
		calc.writelong(proc.a7, proc.pc);	
		//calc.protectlong(proc.a7);
		proc.pc = newpc;
	}
	
	jsr(jemumode mode)
	{
		this.mode = mode;
	}
}

final class link extends jemuinst
{
	jemumode src;
	
	String disassemble(int address)
	{
		return "LINK #nnnn," + src.name();
	}
	
	void execute()
	{
		proc.a7 -= 4;
		calc.writelong(proc.a7, src.readlong(false));
		short offset = calc.readword(proc.pc);
		proc.pc += 2;
		src.writelong(proc.a7);
		proc.a7 += offset;
	}
	
	link(jemumode src)
	{
		this.src = src;
	}
}

class movemltomem extends jemuinst
{
	jemumode dest;
	
	String disassemble(int address)
	{
		return "MOVEM.L regs," + dest.name();
	}
	
	void execute()
	{
		short mask = calc.readword(proc.pc);
		proc.pc += 2;
		int addr = dest.calcaddress();
		for (int d = 0; d <= 7; d++)
		{
			if ((mask & 1) != 0) 
			{
				calc.writelong(addr, proc.dn(d));
				addr += 4;
			}
			mask >>= 1;			
		}
		for (int a = 0; a <= 7; a++)
		{
			if ((mask & 1) != 0) 
			{
				calc.writelong(addr, proc.an(a));
				addr += 4;
			}
			mask >>= 1;
		}
	}
	
	movemltomem(jemumode mode)
	{
		this.dest = mode;
	}
}

final class lsll extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int address)
	{
		return "LSL.L " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int shift = src.readlong(true) & 63;
		int value = dest.readlong(false);
		proc.overflow = false;
		while (shift-- > 0)
		{
			proc.carry = proc.extend = value < 0;
			value = value + value;
		}
		proc.zero = value == 0;
		proc.sign = value < 0;
		dest.writelong(value);
	}
	
	lsll(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class addl extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "ADD.L " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int srcval = src.readlong(true);
		dest.writelong(proc.addl(srcval, dest.readlong(false)));
		proc.extend = proc.carry;
	}
	
	addl(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

class swap extends jemuinst
{
	jemumode src;
	
	String disassemble(int address)
	{
		return "SWAP " + src.name();
	}
	
	void execute()
	{
		int result = src.readlong(false);
		result = (result << 16) | (result >>> 16);
		src.writelong(result);
		proc.carry = proc.overflow = false;
		proc.sign = result < 0;
		proc.zero = result == 0;
	}
	
	swap(jemumode src)
	{
		this.src = src;
	}
}

class clrw extends jemuinst
{
	jemumode mode;
	
	String disassemble(int address)
	{
		return "CLR.W " + mode.name();
	}
	
	void execute()
	{
		mode.writeword((short)0);
		proc.zero = true;
		proc.sign = proc.overflow = proc.carry = false;
	}
	
	clrw(jemumode mode)
	{
		this.mode = mode;
	}
}

class andw extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "AND.W " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		short result = src.readword(true);
		result &= dest.readword(false);		
		proc.carry = proc.overflow = false;
		proc.sign = result < 0;
		proc.zero = result == 0;
		dest.writeword(result);
	}
	
	andw(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class lsrl extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int address)
	{
		return "LSR.L " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int shift = src.readlong(true) & 63;
		int value = dest.readlong(false);
		proc.overflow = false;
		while (shift-- > 0)
		{
			proc.carry = proc.extend = (value & 1) != 0;
			value >>>= 1;
		}
		proc.zero = value == 0;
		proc.sign = value < 0;
		dest.writelong(value);
	}
	
	lsrl(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class asrl extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int address)
	{
		return "ASR.L " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int shift = src.readlong(true) & 63;
		int value = dest.readlong(false);
		proc.overflow = false;
		proc.carry = false;
		while (shift-- > 0)
		{
			proc.carry = proc.extend = (value & 1) != 0;
			value >>= 1;
		}
		proc.zero = value == 0;
		proc.sign = value < 0;
		dest.writelong(value);
	}
	
	asrl(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

class andl extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "AND.L " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int result = src.readlong(true);
		result &= dest.readlong(false);
		dest.writelong(result);
		proc.carry = proc.overflow = false;
		proc.sign = result < 0;
		proc.zero = result == 0;
	}
	
	andl(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

class movemltoregs extends jemuinst
{
	jemumode dest;
	
	String disassemble(int address)
	{
		return "MOVEM.L " + dest.name() + ",regs";
	}
	
	void execute()
	{
		short mask = calc.readword(proc.pc);
		proc.pc += 2;
		int addr = dest.calcaddress();
		for (int d = 0; d <= 7; d++)
		{
			if ((mask & 1) != 0) 
			{
				proc.amodes[d].writelong(calc.readlong(addr));
				addr += 4;
			}
			mask >>= 1;			
		}
		for (int a = 0; a <= 7; a++)
		{
			if ((mask & 1) != 0) 
			{
				proc.amodes[a + 8].writelong(calc.readlong(addr));
				addr += 4;
			}
			mask >>= 1;
		}
	}
	
	movemltoregs(jemumode mode)
	{
		this.dest = mode;
	}
}

final class unlk extends jemuinst
{
	jemumode src;
	
	String disassemble(int address)
	{
		return "UNLK #nnnn," + src.name();
	}
	
	void execute()
	{
		proc.a7 = src.readlong(true);
		src.writelong(calc.readlong(proc.a7));
		proc.a7 += 4;
	}
	
	unlk(jemumode src)
	{
		this.src = src;
	}
}

final class rts extends jemuinst
{
	String disassemble(int address) { return "RTS"; }
	void execute() 
	{ 
		proc.pc = calc.readlong(proc.a7);
		//calc.unprotectlong(proc.a7);
		proc.a7 += 4;
	}
}

final class extl extends jemuinst
{
	jemumode src;
	
	String disassemble(int address)
	{
		return "EXT.L " + src.name();
	}
	
	void execute()
	{
		src.writelong(src.readword(false));
	}
	
	extl(jemumode src)
	{
		this.src = src;
	}
}

final class subw extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "SUB.W " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		short srcval = src.readword(true);
		dest.writeword(proc.subw(srcval, dest.readword(false)));
		proc.extend = proc.carry;
	}
	
	subw(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class tstl extends jemuinst
{
	jemumode mode;
	
	String disassemble(int address)
	{
		return "TST.L " + mode.name();
	}
	
	void execute()
	{
		int value = mode.readlong(true);
		proc.overflow = proc.carry = false;
		proc.zero = value == 0;
		proc.sign = value < 0;
	}
	
	tstl(jemumode mode)
	{
		this.mode = mode;
	}
}

class addw extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "ADD.W " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		short srcval = src.readword(true);
		dest.writeword(proc.addw(srcval, dest.readword(false)));
		proc.extend = proc.carry;
	}
	
	addw(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

class movemlpostinc extends jemuinst
{
	jemumode dest;
	
	String disassemble(int address)
	{
		return "MOVEM.L " + dest.name() + ",regs";
	}
	
	void execute()
	{
		short mask = calc.readword(proc.pc);
		proc.pc += 2;
		for (int d = 0; d <= 7; d++)
		{
			if ((mask & 1) != 0) 
			{
				proc.amodes[d].writelong(dest.readlong(true));
			}
			mask >>= 1;			
		}
		for (int a = 0; a <= 7; a++)
		{
			if ((mask & 1) != 0) 
			{
				proc.amodes[a + 8].writelong(dest.readlong(true));
			}
			mask >>= 1;
		}
	}
	
	movemlpostinc(jemumode mode)
	{
		this.dest = mode;
	}
}

final class lslw extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int address)
	{
		return "LSL.W " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int shift = src.readlong(true) & 63;
		short value = dest.readword(false);
		proc.overflow = false;
		while (shift-- > 0)
		{
			proc.carry = proc.extend = value < 0;
			value = (short) (value + value);
		}
		proc.zero = value == 0;
		proc.sign = value < 0;
		dest.writeword(value);
	}
	
	lslw(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class tstw extends jemuinst
{
	jemumode mode;
	
	String disassemble(int address)
	{
		return "TST.W " + mode.name();
	}
	
	void execute()
	{
		short value = mode.readword(true);
		proc.overflow = proc.carry = false;
		proc.zero = value == 0;
		proc.sign = value < 0;
	}
	
	tstw(jemumode mode)
	{
		this.mode = mode;
	}
}

class subaw extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "SUBA.W " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		short srcval = src.readword(true);
		int result = dest.readlong(false) - srcval;
		dest.writelong(result);
	}
	
	subaw(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class addaw extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "ADDA.W " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		short srcval = src.readword(true);
		int result = dest.readlong(false) + srcval;
		dest.writelong(result);
	}
	
	addaw(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class moveaw extends jemuinst
{
	jemumode src;
	jemumode dest;
	
	String disassemble(int addrress)
	{
		return "MOVEA.W " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		dest.writelong(src.readword(true));
	}
	
	moveaw(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

class tstb extends jemuinst
{
	jemumode mode;
	
	String disassemble(int address)
	{
		return "TST.B " + mode.name();
	}
	
	void execute()
	{
		byte value = mode.readbyte(true);
		proc.overflow = proc.carry = false;
		proc.zero = value == 0;
		proc.sign = value < 0;
	}
	
	tstb(jemumode mode)
	{
		this.mode = mode;
	}
}

class lsrb extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int address)
	{
		return "LSR.B " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int shift = src.readlong(true) & 63;
		byte value = dest.readbyte(false);
		proc.overflow = false;
		while (shift-- > 0)
		{
			proc.carry = proc.extend = (value & 1) != 0;
			value >>>= 1;
			value &= 0x7F;
		}
		proc.zero = value == 0;
		proc.sign = value < 0;
		dest.writebyte(value);
	}
	
	lsrb(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

class movemwpredec extends jemuinst
{
	jemumode dest;
	
	String disassemble(int address)
	{
		return "MOVEM.W regs," + dest.name();
	}
	
	void execute()
	{
		short mask = calc.readword(proc.pc);
		proc.pc += 2;
		for (int a = 7; a >= 0; a--)
		{
			if ((mask & 1) != 0) dest.writeword((short)proc.an(a));
			mask >>= 1;
		}
		for (int d = 7; d >= 0; d--)
		{
			if ((mask & 1) != 0) dest.writeword((short)proc.dn(d));
			mask >>= 1;
		}
	}
	
	movemwpredec(jemumode mode)
	{
		this.dest = mode;
	}
}

class movemwpostinc extends jemuinst
{
	jemumode dest;
	
	String disassemble(int address)
	{
		return "MOVEM.W " + dest.name() + ",regs";
	}
	
	void execute()
	{
		short mask = calc.readword(proc.pc);
		proc.pc += 2;
		for (int d = 0; d <= 7; d++)
		{
			if ((mask & 1) != 0) 
			{
				proc.amodes[d].writelong(dest.readword(true));
			}
			mask >>= 1;			
		}
		for (int a = 0; a <= 7; a++)
		{
			if ((mask & 1) != 0) 
			{
				proc.amodes[a + 8].writelong(dest.readword(true));
			}
			mask >>= 1;
		}
	}
	
	movemwpostinc(jemumode mode)
	{
		this.dest = mode;
	}
}

class clrb extends jemuinst
{
	jemumode mode;
	
	String disassemble(int address)
	{
		return "CLR.B " + mode.name();
	}
	
	void execute()
	{
		mode.writebyte((byte)0);
		proc.zero = true;
		proc.sign = proc.overflow = proc.carry = false;
	}
	
	clrb(jemumode mode)
	{
		this.mode = mode;
	}
}

final class trap extends jemuinst
{
	int v;
	
	String disassemble(int address)
	{
		return "TRAP #" + v;
	}
	
	void execute()
	{
		throw new CPUException(v + 0x20);
	}
	
	trap(int v) { this.v = v; }
}

final class CPUException extends RuntimeException
{
	int vector;
	CPUException(int vector)
	{
		this.vector = vector;
	}
}

final class rte extends jemuinst
{
	String disassemble(int address) { return "RTE"; }
	void execute() 
	{ 
		short newsr = calc.readword(proc.a7);
		proc.a7 += 2;
		proc.pc = calc.readlong(proc.a7);
		proc.a7 += 4;
		proc.setsr(newsr);
	}
}

final class orw extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "OR.W " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		short result = src.readword(true);
		result |= dest.readword(false);
		dest.writeword(result);
		proc.carry = proc.overflow = false;
		proc.sign = result < 0;
		proc.zero = result == 0;
	}
	
	orw(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class scc extends jemuinst
{
	jemumode reg;
	int condition;
	
	String disassemble(int address)
	{
		return "S" + proc.decodecondition(condition) + " " + reg.name();
	}
	
	void execute()
	{
		reg.writebyte(proc.testcondition(condition) ? (byte)0xFF : (byte)0);
	}
	
	scc(int condition, jemumode mode)
	{
		this.reg = mode;
		this.condition = condition;
	}
}

final class muls extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "MULS " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int result = src.readword(true);
		result *= dest.readword(false);
		dest.writelong(result);
		proc.carry = proc.overflow = false;
		proc.sign = result < 0;
		proc.zero = result == 0;
	}
	
	muls(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class pea extends jemuinst
{
	jemumode mode;
	
	String disassemble(int address)
	{
		return "PEA " + mode.name();
	}
	
	void execute()
	{
		int addr = mode.calcaddress();
		proc.a7 -= 4;
		calc.writelong(proc.a7, addr);	
	}
	
	pea(jemumode mode)
	{
		this.mode = mode;
	}
}

final class mulu extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "MULU " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int x = src.readword(true);
		x &= 0xFFFF;
		int y = dest.readword(false);
		y &= 0xFFFF;
		int result = x * y;
		dest.writelong(result);
		proc.carry = proc.overflow = false;
		proc.sign = result < 0;
		proc.zero = result == 0;
	}
	
	mulu(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class asrw extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int address)
	{
		return "ASR.W " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int shift = src.readlong(true) & 63;
		short value = dest.readword(false);
		proc.overflow = false;
		proc.carry = false;
		while (shift-- > 0)
		{
			proc.carry = proc.extend = (value & 1) != 0;
			value >>= 1;
		}
		proc.zero = value == 0;
		proc.sign = value < 0;
		dest.writeword(value);
	}
	
	asrw(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class notb extends jemuinst
{
	jemumode mode;
	
	String disassemble(int address)
	{
		return "NOT.B " + mode.name();
	}
	
	void execute()
	{
		byte value = mode.readbyte(false);
		value ^= 0xFF;
		mode.writebyte(value);
		proc.overflow = proc.carry = false;
		proc.zero = value == 0;
		proc.sign = value < 0;
	}
	
	notb(jemumode mode)
	{
		this.mode = mode;
	}
}

final class addb extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "ADD.B " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		byte srcval = src.readbyte(true);
		dest.writebyte(proc.addb(srcval, dest.readbyte(false)));
		proc.extend = proc.carry;
	}
	
	addb(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class subb extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "SUB.B " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		byte srcval = src.readbyte(true);
		dest.writebyte(proc.subb(srcval, dest.readbyte(false)));
		proc.extend = proc.carry;
	}
	
	subb(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class lslb extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int address)
	{
		return "LSL.B " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int shift = src.readlong(true) & 63;
		byte value = dest.readbyte(false);
		proc.overflow = false;
		while (shift-- > 0)
		{
			proc.carry = proc.extend = value < 0;
			value = (byte) (value + value);
		}
		proc.zero = value == 0;
		proc.sign = value < 0;
		dest.writebyte(value);
	}
	
	lslb(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class extw extends jemuinst
{
	jemumode src;
	
	String disassemble(int address)
	{
		return "EXT.W " + src.name();
	}
	
	void execute()
	{
		src.writeword(src.readbyte(false));
	}
	
	extw(jemumode src)
	{
		this.src = src;
	}
}

final class addal extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "ADDA.L " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int srcval = src.readlong(true);
		int result = dest.readlong(false) + srcval;
		dest.writelong(result);
	}
	
	addal(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class rorb extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int address)
	{
		return "ROR.B " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int shift = src.readlong(true) & 63;
		byte value = dest.readbyte(false);
		proc.overflow = false;
		proc.carry = false;
		while (shift-- > 0)
		{
			proc.carry = ((value & 1) == 1); 
			value >>>= 1;
			value &= 0x7F;
			if (proc.carry) value |= 0x80;
		}
		proc.zero = value == 0;
		proc.sign = value < 0;
		dest.writebyte(value);
	}
	
	rorb(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class negb extends jemuinst
{
	jemumode mode;
	
	String disassemble(int address)
	{
		return "NEG.B " + mode.name();
	}
	
	void execute()
	{
		byte value = mode.readbyte(false);
		value = (byte) -value;
		mode.writebyte(value);
		proc.extend = proc.carry = value != 0;
		proc.overflow = value == -0x80;
		proc.zero = value == 0;
		proc.sign = value < 0;
	}
	
	negb(jemumode mode)
	{
		this.mode = mode;
	}
}

final class negw extends jemuinst
{
	jemumode mode;
	
	String disassemble(int address)
	{
		return "NEG.W " + mode.name();
	}
	
	void execute()
	{
		short value = mode.readword(false);
		value = (short) -value;
		mode.writeword(value);
		proc.extend = proc.carry = value != 0;
		proc.overflow = value == -0x8000;
		proc.zero = value == 0;
		proc.sign = value < 0;
	}
	
	negw(jemumode mode)
	{
		this.mode = mode;
	}
}

final class btst extends jemuinst
{
	jemumode dest;
	jemumode src;
	boolean large;
	
	String disassemble(int addrress)
	{
		return "BTST " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		if (!large)
		{
			int bit = 1 << (src.readbyte(true) & 0x7);
			byte value = dest.readbyte(true);
			proc.zero = (value & bit) == 0;
		}
		else
		{
			int bit = 1 << (src.readbyte(true) & 0x1F);
			int value = dest.readlong(true);
			proc.zero = (value & bit) == 0;
		}
	}
	
	btst(jemumode src, jemumode dest, boolean large)
	{
		this.dest = dest;
		this.src = src;
		this.large = large;
	}
}

final class bset extends jemuinst
{
	jemumode dest;
	jemumode src;
	boolean large;
	
	String disassemble(int addrress)
	{
		return "BSET " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		if (!large)
		{
			int bit = 1 << (src.readbyte(true) & 0x7);
			byte value = dest.readbyte(false);
			proc.zero = (value & bit) == 0;
			dest.writebyte((byte) (value | bit));
		}
		else
		{
			int bit = 1 << (src.readbyte(true) & 0x1F);
			int value = dest.readlong(false);
			proc.zero = (value & bit) == 0;
			dest.writelong(value | bit);
		}
	}
	
	bset(jemumode src, jemumode dest, boolean large)
	{
		this.dest = dest;
		this.src = src;
		this.large = large;
	}
}

final class orl extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "OR.L " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int result = src.readlong(true);
		result |= dest.readlong(false);
		dest.writelong(result);
		proc.carry = proc.overflow = false;
		proc.sign = result < 0;
		proc.zero = result == 0;
	}
	
	orl(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class divu extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "DIVU " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int divisor = src.readword(true) & 0xFFFF;
		long dividend = dest.readlong(false); // flag doesnt matter since always a dreg
		if (dividend < 0) dividend += 0x100000000L;
		if (divisor == 0) throw new CPUException (5);
		int quotient = (int) (dividend / divisor);
		int remainder = (int) (dividend % divisor);
		proc.carry = false;
		if (quotient >= 0x10000)
		{
			proc.overflow = true;
		}
		else
		{
			proc.overflow = false;
			proc.zero = quotient == 0;
			proc.sign = quotient >= 0x8000;
			dest.writelong((remainder << 16) | quotient);
		}
	}
	
	divu(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class notw extends jemuinst
{
	jemumode mode;
	
	String disassemble(int address)
	{
		return "NOT.W " + mode.name();
	}
	
	void execute()
	{
		short value = mode.readword(false);
		value ^= 0xFFFF;
		mode.writeword(value);
		proc.overflow = proc.carry = false;
		proc.zero = value == 0;
		proc.sign = value < 0;
	}
	
	notw(jemumode mode)
	{
		this.mode = mode;
	}
}

final class negl extends jemuinst
{
	jemumode mode;
	
	String disassemble(int address)
	{
		return "NEG.L " + mode.name();
	}
	
	void execute()
	{
		int value = mode.readlong(false);
		value = -value;
		mode.writelong(value);
		proc.extend = proc.carry = value != 0;
		proc.overflow = value == -0x80000000;
		proc.zero = value == 0;
		proc.sign = value < 0;
	}
	
	negl(jemumode mode)
	{
		this.mode = mode;
	}
}

final class cmpaw extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "CMPA.W " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int srcval = src.readword(true);
		proc.subl(srcval, dest.readlong(true));
	}
	
	cmpaw(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class divs extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "DIVS " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int divisor = src.readword(true) & 0xFFFF;
		int dividend = dest.readlong(false); // flag doesnt matter since always a dreg
		if (divisor == 0) throw new CPUException (5);
		int quotient = dividend / divisor;
		int remainder = dividend % divisor;
		proc.carry = false;
		if (quotient >= 0x8000 || quotient < -0x8000)
		{
			proc.overflow = true;
		}
		else
		{
			proc.overflow = false;
			proc.zero = quotient == 0;
			proc.sign = quotient >= 0x8000;
			dest.writelong((remainder << 16) | (quotient & 0xFFFF));
		}
	}
	
	divs(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class aslw extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int address)
	{
		return "ASL.W " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int shift = src.readlong(true) & 63;
		short value = dest.readword(false);
		proc.overflow = false;
		while (shift-- > 0)
		{
			proc.carry = proc.extend = value < 0;
			value = (short) (value + value);
			if ((value < 0) != proc.carry) proc.overflow = true;
		}
		proc.zero = value == 0;
		proc.sign = value < 0;
		dest.writeword(value);
	}
	
	aslw(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

class lsrw extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int address)
	{
		return "LSR.W " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int shift = src.readlong(true) & 63;
		short value = dest.readword(false);
		proc.overflow = false;
		while (shift-- > 0)
		{
			proc.carry = proc.extend = (value & 1) != 0;
			value >>>= 1;
			value &= 0x7FFF;
		}
		proc.zero = value == 0;
		proc.sign = value < 0;
		dest.writeword(value);
	}
	
	lsrw(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class eorw extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "EOR.W " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		short result = src.readword(true);
		result ^= dest.readword(false);
		dest.writeword(result);
		proc.carry = proc.overflow = false;
		proc.sign = result < 0;
		proc.zero = result == 0;
	}
	
	eorw(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class eorl extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "EOR.L " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int result = src.readlong(true);
		result ^= dest.readlong(false);
		dest.writelong(result);
		proc.carry = proc.overflow = false;
		proc.sign = result < 0;
		proc.zero = result == 0;
	}
	
	eorl(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class movetoccr extends jemuinst
{
	jemumode src;
	
	String disassemble(int address)
	{
		return "MOVE " + src.name() + ",CCR";
	}
	
	void execute()
	{
		proc.setsr((short)((proc.getsr() & 0xFF00) | (0xFF & src.readbyte(true))));
	}
	
	movetoccr(jemumode src)
	{
		this.src = src;
	}
}

final class abcd extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "ABCD " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int s = src.readbyte(true);
		int d = dest.readbyte(false);
		int lowsum = (s & 0xf) + (d & 0xf);
		if (proc.extend) lowsum++;
		int carrymid = 0;
		if (lowsum >= 0xA)
		{
			lowsum -= 0xA;
			carrymid = 0x10;
		}
		int highsum = (d & 0xF0) + (s & 0xF0) + carrymid;
		if (highsum >= 0xA0)
		{
			proc.carry = true;
			highsum -= 0xA0;
		}
		else
		{
			proc.carry = false;
		}
		proc.extend = proc.carry;
		int result = highsum + lowsum;
		if (result != 0) proc.zero = false; // note does not set the zero flag when zero
		dest.writebyte((byte) result);
	}
	
	abcd(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class exg extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "EXG " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int t = src.readlong(false);
		src.writelong(dest.readlong(false));
		dest.writelong(t);
	}
	
	exg(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class rorl extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int address)
	{
		return "ROR.L " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int shift = src.readlong(true) & 63;
		int value = dest.readlong(false);
		proc.overflow = false;
		proc.carry = false;
		while (shift-- > 0)
		{
			proc.carry = ((value & 1) == 1); 
			value >>>= 1;
			if (proc.carry) value |= 0x80000000;
		}
		proc.zero = value == 0;
		proc.sign = value < 0;
		dest.writelong(value);
	}
	
	rorl(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class bclr extends jemuinst
{
	jemumode dest;
	jemumode src;
	boolean large;
	
	String disassemble(int addrress)
	{
		return "BCLR " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		if (!large)
		{
			int bit = 1 << (src.readbyte(true) & 0x7);
			byte value = dest.readbyte(false);
			proc.zero = (value & bit) == 0;
			if (!proc.zero) value -= bit;
			dest.writebyte(value);
		}
		else
		{
			int bit = 1 << (src.readbyte(true) & 0x1F);
			int value = dest.readlong(false);
			proc.zero = (value & bit) == 0;
			if (!proc.zero) value -= bit;
			dest.writelong(value);
		}
	}
	
	bclr(jemumode src, jemumode dest, boolean large)
	{
		this.dest = dest;
		this.src = src;
		this.large = large;
	}
}

final class movesr extends jemuinst
{
	jemumode src;
	
	String disassemble(int address)
	{
		return "MOVE SR," + src.name();
	}
	
	void execute()
	{
		src.writeword(proc.getsr());
	}
	
	movesr(jemumode src)
	{
		this.src = src;
	}
}

final class eorb extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "EOR.B " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		byte result = src.readbyte(true);
		result ^= dest.readbyte(false);
		dest.writebyte(result);
		proc.carry = proc.overflow = false;
		proc.sign = result < 0;
		proc.zero = result == 0;
	}
	
	eorb(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class bchgi extends jemuinst
{
	jemumode dest;
	boolean dreg;
	
	String disassemble(int addrress)
	{
		return (dreg ? "BCHG #n," : "BSET #nn,") + dest.name();
	}
	
	void execute()
	{
		byte imm = calc.readbyte(proc.pc + 1);
		proc.pc += 2;
		if (dreg)
		{
			int bit = 1 << (imm & 31);
			int value = dest.readlong(false);
			proc.zero = (value & bit) == 0;
			value = value ^ bit;
			dest.writelong(value);
		}
		else
		{
			int bit = 1 << (imm & 7);
			byte value = dest.readbyte(false);
			proc.zero = (value & bit) == 0;
			value = (byte)(value ^ bit);
			dest.writebyte(value);
		}
	}
	
	bchgi(jemumode dest, boolean dreg)
	{
		this.dest = dest;
		this.dreg = dreg;
	}
}

final class moveusp extends jemuinst
{
	jemumode src;
	
	String disassemble(int address)
	{
		return "MOVE USP," + src.name();
	}
	
	void execute()
	{
		src.writelong(proc.a8);
	}
	
	moveusp(jemumode src)
	{
		this.src = src;
	}
}

final class roll extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int address)
	{
		return "ROL.L " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int shift = src.readlong(true) & 63;
		int value = dest.readlong(false);
		proc.overflow = false;
		proc.carry = false;
		while (shift-- > 0)
		{
			proc.carry = (value < 0); 
			value = value + value;
			if (proc.carry) value |= 1;
		}
		proc.zero = value == 0;
		proc.sign = value < 0;
		dest.writelong(value);
	}
	
	roll(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class rolw extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int address)
	{
		return "ROL.W " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int shift = src.readlong(true) & 63;
		short value = dest.readword(false);
		proc.overflow = false;
		proc.carry = false;
		while (shift-- > 0)
		{
			proc.carry = (value < 0); 
			value = (short) (value + value);
			if (proc.carry) value |= 1;
		}
		proc.zero = value == 0;
		proc.sign = value < 0;
		dest.writeword(value);
	}
	
	rolw(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class nbcd extends jemuinst
{
	jemumode dest;
	
	String disassemble(int addrress)
	{
		return "NBCD " + dest.name();
	}
	
	void execute()
	{
		int s = dest.readbyte(true);
		
		int low = 10 - (s & 0xF);
		if (proc.extend) low--;
		int high = (0xA0) - (s & 0xF0);
		if (low != 0) high--;
		int result = high + low;
		if (result != 0) proc.zero = false; // note does not set the zero flag when zero
		proc.carry = proc.extend = (result != 0);
		dest.writebyte((byte) result);
	}
	
	nbcd(jemumode dest)
	{
		this.dest = dest;
	}
}

final class subxl extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "SUBX.L " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int subtrahend = src.readlong(true);
		int minuend = dest.readlong(false);
		
		if (proc.extend) subtrahend++;
		int result = minuend - subtrahend;
		if (result != 0) proc.zero = false;
		proc.sign = result < 0;
		proc.overflow = (minuend >= 0 && subtrahend < 0 && result < 0) || (minuend <= 0 && subtrahend > 0 && result >= 0); 
		proc.extend = (subtrahend - 0x80000000) > (minuend - 0x80000000);
		
		dest.writelong(result);
		proc.carry = proc.extend;
	}
	
	subxl(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class sbcd extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int addrress)
	{
		return "SBCD " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int s = src.readbyte(true);
		int d = dest.readbyte(false);
		
		int subtrahend = ((s >> 4) & 0xF) * 10 + (s & 0xF);
		int minuend = ((d >> 4) & 0xF) * 10 + (d & 0xF);
		
		if (proc.extend) subtrahend++;		
		int result = minuend - subtrahend;		
		
		proc.carry = proc.extend = false;
		if (result < 0)
		{
			proc.carry = proc.extend = true;
			result += 100;
		}
		if (result != 0) proc.zero = false;
		
		byte r = (byte) ((result % 10) + ((result / 10) << 4));		
		dest.writebyte(r);		
	}
	
	sbcd(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class roxll extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int address)
	{
		return "ROXL.L " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int shift = src.readlong(true) & 63;
		int value = dest.readlong(false);
		proc.overflow = false;
		while (shift-- > 0)
		{
			int entering = proc.extend ? 1 : 0;
			proc.extend = proc.carry = (value < 0);
			value = value + value + entering;
		}
		proc.zero = value == 0;
		proc.sign = value < 0;
		dest.writelong(value);
	}
	
	roxll(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}

final class roxlw extends jemuinst
{
	jemumode dest;
	jemumode src;
	
	String disassemble(int address)
	{
		return "ROXL.W " + src.name() + "," + dest.name();
	}
	
	void execute()
	{
		int shift = src.readlong(true) & 63;
		short value = dest.readword(false);
		proc.overflow = false;
		
		while (shift-- > 0)
		{
			short entering = proc.extend ? (short)1 : (short)0;
			proc.extend = proc.carry = (value < 0);
			value = (short) (value + value + entering);
		}
		proc.zero = value == 0;
		proc.sign = value < 0;
		dest.writeword(value);
	}
	
	roxlw(jemumode src, jemumode dest)
	{
		this.src = src;
		this.dest = dest;
	}
}