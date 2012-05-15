MODE_DREG = 0
MODE_AREG = 1
MODE_AREG_INDIRECT = 2
MODE_AREG_POSTINC = 3
MODE_AREG_PREDEC = 4
MODE_AREG_OFFSET = 5
MODE_AREG_INDEX = 6
MODE_MISC = 7
MISCMODE_SHORT = 0
MISCMODE_LONG = 1
MISCMODE_PC_o = 2
MISCMODE_PC_INDEX = 3
MISCMODE_IMM = 4 

def size_name(size):
	if size==0: return ".B"
	if size==1: return ".W"
	return ".L"

# Return accessor string for given address register
def areg_string(reg):
	return "a" + str(reg)
	
# Return friendly text description of the addressing mode
def amode_name(mode, reg):
	if mode==MODE_DREG: return "D" + str(reg)
	if mode==1: return "A" + str(reg)
	if mode==2: return "(A" + str(reg) + ")"
	if mode==3: return "(A" + str(reg) + ")+"
	if mode==MODE_AREG_PREDEC: return "-(A" + str(reg) + ")"
	if mode==5: return "nnn(A" + str(reg) + ")"
	if mode==6: return "n(A" + str(reg) + ",Dn)"
	if mode==7 and reg==0: return "nnn.W"
	if mode==7 and reg==1: return "nnnnn.L"
	if mode==7 and reg==2: return "nnn(PC)"
	if mode==7 and reg==3: return "n(PC,Dn)"
	if mode==7 and reg==4: return "#"
	return "unk"
	
def valid_source(mode, reg):
	return mode < 7 or reg <= 4
	
def valid_dest(mode, reg):
	return mode < 7 or reg <= 1

# Generate code to read bytes after the pc into the specified variable.  Advances the PC unless the
# sideffects variable is set to false.
def read_pc(size, dest, sideeffects = True):
	if size==0:
		print "var " + dest + "=rb(pc+1);"
		if sideeffects: print "pc+=2;"
	if size==1:
		print "var " + dest + "=rw(pc);"
		if sideeffects: print "pc+=2;"
	if size==2:
		print "var " + dest + "=rl(pc);"
		if sideeffects: print "pc+=4;"
	
def get_read(size):
	if size == 0: return "rb"
	if size == 1: return "rw"
	if size == 2: return "rl"
	
def get_write(size):
	if size == 0: return "wb"
	if size == 1: return "ww"
	if size == 2: return "wl"
	
# Generate code to read from the specified effective a (mode, reg) into the variable s.
# The sideeffects parameter controls whether other effects (pre-increment/post-decrement and advancing
# PC for immediate) should happen - this should be set unless the operand is both source and
# destination in which case the side effects should only happen on the write.
def amode_read(mode, reg, size, sideeffects = True):
	ao = size + 1 # pre-decrement / post-increment size
	if ao == 3: ao = 4
	if ao == 1 and reg == 7: ao = 2
	ao = str(ao)
	# immediate
	if mode == MODE_MISC and reg == MISCMODE_IMM:
		read_pc(size, "s", sideeffects)
		return
	# PC-relative
	if mode == MODE_MISC and reg == MISCMODE_PC_o:
		read_pc(1, "o", sideeffects)
		print "var a=pc+ewl(o)-2;"
		print "var s=" + get_read(size) + "(a);"
		return
	# PC-relative indexed
	if mode == MODE_MISC and reg == MISCMODE_PC_INDEX:
		read_pc(1, "e", sideeffects)
		print "var a=e&0xFF;"
		print "if(a>127)a-=256;"
		print "a+=pc-2;"
		print "var x=(e>>>12)&7;"
		print "var y=(e>32767)?an(x):dn(x);"
		print "if(!(e&0x800))y=ewl(y);"
		print "var s=" + get_read(size) + "(y+a);"
		return
	# Absolute long
	if mode == MODE_MISC and reg == 1:
		read_pc(2, "a", sideeffects)
		print "var s=" + get_read(size) + "(a);"
		return
	# Absolute short
	if mode == MODE_MISC and reg == 0:
		read_pc(1, "a", sideeffects)
		print "var s=" + get_read(size) + "(ewl(a));"
		return
	# a register indirect
	if mode == MODE_AREG_INDIRECT:
		print "var s=" + get_read(size) + "(" + areg_string(reg) + ");"
		return
	# a register indirect with postincrement 
	if mode == 3:
		print "var s=" + get_read(size) + "(" + areg_string(reg) + ");" 
		if sideeffects: print areg_string(reg) + "+=" + ao + ";"
		return
	# a register indirect with predecrement
	if mode == 4:
		if sideeffects:
			print areg_string(reg) + "-=" + ao + ";"
			print "var s=" + get_read(size) + "(" + areg_string(reg) + ");" 
		else:
			print "var s=" + get_read(size) + "(" + areg_string(reg) + "-" + ao + ");" 
		return
	# a register indirect with o
	if mode == MODE_AREG_OFFSET:
		read_pc(1, "o", sideeffects)
		print "var a=" + areg_string(reg) + "+ewl(o);"
		print "var s=" + get_read(size) + "(a);"
		return
	# a register indirect with indexing
	if mode == MODE_AREG_INDEX:
		read_pc(1, "e", sideeffects)
		print "var a=e&255;"
		print "if (a>=128)a-=256;"
		print "a+=a" + str(reg) + ";"
		print "var x=(e>>>12)&7;"
		print "var y=(e>32767)?an(x):dn(x);"
		print "if(!(e&0x800))y=ewl(y);"
		print "var s=" + get_read(size) + "(y+a);"
		return
	# Data register direct
	if mode == MODE_DREG:
		if size == 0:
			print "var s=d" + str(reg) + "&255;"
		if size == 1:
			print "var s=d" + str(reg) + "&65535;"
		if size == 2:
			print "var s=d" + str(reg) + ";"
		return
	# a register direct
	if mode == MODE_AREG:
		if size == 1:
			print "var s=a" + str(reg) + "&65535;"
		if size == 2:
			print "var s=a" + str(reg) + ";"
		return
	print "throw 4";

# generate code to write the data to the effective a specified by mode and reg of size size
def amode_write(mode, reg, size, data):
	ao = size + 1 # pre-decrement / post-increment size
	if ao == 3: ao = 4
	if ao == 1 and reg == 7: ao = 2
	ao = str(ao)
	# Absolute long
	if mode == MODE_MISC and reg == MISCMODE_LONG:
		print "var a=rl(pc);"
		print "pc+=4;"
		print get_write(size)+"(a," + data + ");"
		return
	# Absolute short
	if mode == MODE_MISC and reg == MISCMODE_SHORT:
		print "var a=ewl(rw(pc));"
		print "pc+=2;"
		print get_write(size)+"(a," + data + ");"
		return
	# a register direct
	if mode == MODE_AREG:
		if size == 2:
			print areg_string(reg) + "=" + data + ";"
			return
		if size == 1:
			print areg_string(reg) + "=ewl(" + data + ");"
			return
	# a register indirect
	if mode == MODE_AREG_INDIRECT:
		print get_write(size)+"(" + areg_string(reg) + "," + data + ");"
		return
	# a register indirect with postincrement 
	if mode == MODE_AREG_POSTINC:
		print get_write(size)+"(" + areg_string(reg) + "," + data + ");"
		print areg_string(reg) + "+=" + ao + ";"
		return
	# a register indirect with predecrement
	if mode == MODE_AREG_PREDEC:
		print areg_string(reg) + "-=" + ao + ";"
		print get_write(size)+"(" + areg_string(reg) + "," + data + ");"
		return
	# a register indirect with o
	if mode == MODE_AREG_OFFSET:
		read_pc(1, "o")
		print get_write(size)+"(" + areg_string(reg) + "+ewl(o)," + data + ");"
		return
	# a register indirect with indexing
	if mode == MODE_AREG_INDEX:
		read_pc(1, "e")
		print "var a=e%256;"
		print "if(a>127)a-=256;"
		print "a+=" + areg_string(reg) + ";"
		print "var x=(e>>>12)&7;"
		print "var y=(e>32767)?an(x):dn(x);"
		print "if(!(e&0x800))y=ewl(y);"
		print get_write(size)+"(a+y," + data + ");"
		return
	# Data register direct
	if mode == MODE_DREG:
		if size == 2:
			print "d" + str(reg) + "=" + data + ";"
		if size == 0:
			print "d" + str(reg) + "=((d" + str(reg) + ">>>8)*256)+(" + data + "&255);"
		if size == 1:
			print "d" + str(reg) + "=((d" + str(reg) + ">>>16)*65536)+(" + data + "&65535);"
		return
	print "throw 4;"

# Generates code to set the condition flags based on the value of a variable
def set_condition_flags_data(size, s):
	print "sr&=65520;" # clear negative, zero, overflow, carry
	print "if(" + s + "==0)sr+=4;" # set zero flag
	if size == 0: print "if(" + s + "&128)sr+=8;" # set negative flag
	if size == 1: print "if(" + s + "&32768)sr+=8;" # set negative flag
	if size == 2: print "if(" + s + "&0x80000000)sr+=8;" # set negative flag
	
# determines if effective a can be calculated
def valid_calc_effective_address(mode, reg):
	return mode == MODE_AREG_INDIRECT or mode == MODE_AREG_OFFSET or mode == MODE_AREG_INDEX or (mode == MODE_MISC and (reg <= 3))

# calculates pointer to the effective address in z var
def effective_address_calc(mode, reg):
	# PC-relative
	if mode == MODE_MISC and reg == MISCMODE_PC_o:
		read_pc(1, "o")
		print "var z=pc-2+ewl(o);"
		return
	# PC-relative indexed
	if mode == MODE_MISC and reg == MISCMODE_PC_INDEX:
		read_pc(1, "e")
		print "var a=e&0xFF;"
		print "if(a>127)a-=256;"
		print "a+=pc-2;"
		print "var x=(e>>>12)&7;"
		print "var y=(e>32767)?an(x):dn(x);"
		print "if (!(e&0x800))y=ewl(y);"
		print "var z=y+a;"
		print "if(z>4294967295)z-=4294967296;"
		return
	# a register indirect with indexing
	if mode == MODE_AREG_INDEX:
		read_pc(1, "e")
		print "var a = e&0xFF;"
		print "if(a>127)a-=256;"
		print "a+=" + areg_string(reg) + ";"
		print "var x=(e>>>12)&7;"
		print "var y=(e>32767)?an(x):dn(x);"
		print "if (!(e&0x800))y=ewl(y);"
		print "var z=y+a;"
		print "if(z>4294967295)z-=4294967296;"
		return
	# Absolute long
	if mode == MODE_MISC and reg == MISCMODE_LONG:
		read_pc(2, "z")
		return
	# Absolute short
	if mode == MODE_MISC and reg == MISCMODE_SHORT:
		read_pc(1, "z")
		print "z=ewl(z);"
		return
	# a register indirect with o
	if mode == MODE_AREG_OFFSET:
		read_pc(1, "o")
		print "var z=" + areg_string(reg) + "+ewl(o);"
		print "if(z>4294967295)z-=4294967296"
		return
	# a register indirect
	if mode == MODE_AREG_INDIRECT:
		print "var z=" + areg_string(reg) + ";"
		return
	print "throw 4;"
	
######################################################################## MOVE instructions	

print "function build_t_move() {"

# build all MOVEs of the given size
def make_moves(name, size, pattern):
	for srcmode in range(0,8):
		for srcreg in range(0,8):
			for dstmode in range(0,8):
				if size == 0 and dstmode == 1: continue # no byte moves to a registers
				for dstreg in range(0,8):
					if valid_source(srcmode, srcreg) and valid_dest(dstmode, dstreg):
						opcode = pattern + (dstreg << 9) + (dstmode << 6) + (srcmode << 3) + srcreg
						print "n[" + str(opcode) + "]='" + name + " " + amode_name(srcmode, srcreg) + "," + amode_name(dstmode, dstreg) +"'"
						print "t[" + str(opcode) + "]=function(){"
						amode_read(srcmode, srcreg, size)
						amode_write(dstmode, dstreg, size, "s")
						# set condition codes, except when writing to a registers
						if dstmode != 1:
							set_condition_flags_data(size, "s")
						print "}"
					
# MOVE - note the bit patterns in the instruction to set the size here are different than in most other instructions,
# and Sybex book has the wrong values here!
make_moves("MOVE.L", 2, 0x2000)
make_moves("MOVE.W", 1, 0x3000)
make_moves("MOVE.B", 0, 0x1000) 

# MOVE to SR / CCR
for srcmode in range(0,8):
	for srcreg in range(0,8):
		if valid_source(srcmode, srcreg) and srcmode != MODE_AREG:
			opcode = 0x46C0 + (srcmode << 3) + srcreg;
			print "n[" + str(opcode) + "]='MOVE " + amode_name(srcmode, srcreg) + ",SR'"
			print "t[" + str(opcode) + "]=function(){"
			amode_read(srcmode, srcreg, 1)
			print "	update_sr(s);"
			print "}"
			
			opcode = 0x44C0 + (srcmode << 3) + srcreg;
			print "n[" + str(opcode) + "]='MOVE " + amode_name(srcmode, srcreg) + ",CCR'"
			print "t[" + str(opcode) + "]=function(){"
			amode_read(srcmode, srcreg, 0)
			print "	sr = (sr&0xFF00) + s;"
			print "}"
		if valid_dest(srcmode, srcreg) and srcmode != MODE_AREG:
			opcode = 0x40C0 + (srcmode << 3) + srcreg;
			print "n[" + str(opcode) + "]='MOVE SR," + amode_name(srcmode, srcreg) + "'"
			print "t[" + str(opcode) + "]=function(){"
			amode_write(srcmode, srcreg, 1, "sr")
			print "}"
			
print "}"


############################################################# standard arithmetic

print "function build_t_arithmetic() {"

# perform a standard operation of given size between given source and dest
def do_operation(name, size, source, dest):
	if size == 0 and name == "ADD": print "var r=addb(" + source + "," + dest + ");"
	if size == 1 and name == "ADD": print "var r=addw(" + source + "," + dest + ");"
	if size == 2 and name == "ADD": print "var r=addl(" + source + "," + dest + ");"
	if size == 0 and name == "SUB": print "var r=subb(" + source + "," + dest + ");"
	if size == 1 and name == "SUB": print "var r=subw(" + source + "," + dest + ");"
	if size == 2 and name == "SUB": print "var r=subl(" + source + "," + dest + ");"
	if name == "OR": print "var r=" + source + "|" + dest+ ";"
	if name == "AND": print "var r=" + source + "&" + dest+ ";"
	if name == "EOR": print "var r=" + source + "^" + dest+ ";"
	if name in ("OR", "AND", "EOR"):
		print "if(r<0)r+=0x100000000;"
		set_condition_flags_data(size, "r")

# build standard calculation operations
def build_multi(name, bits):
	for dreg in range(8):
		for reg in range(8):
			for mode in range(8):
				for size in range(3):
					opcode = bits + (dreg << 9) + (size << 6) + (mode << 3) + reg
					# generate version with EA as source
					if valid_source(mode, reg) and name != "EOR": # EA as source does work for EOR
						print "n[" + str(opcode) + "]='" + name + size_name(size) + " " + amode_name(mode,reg) + ",D" + str(dreg) + "'"
						print "t[" + str(opcode) + "]=function(){"
						amode_read(mode, reg, size)
						do_operation(name, size, "s", "d" + str(dreg) + "")
						print "	d" + str(dreg) + " = r;"
						print "}"
					#  generate version with EA as destination
					if valid_dest(mode, reg) and (mode != MODE_DREG or name == "EOR") and mode != MODE_AREG: #EA as dest does not work for registers
						opcode = opcode + 0x100						
						print "n[" + str(opcode) + "]='" + name + size_name(size) + " D" + str(dreg) + "," + amode_name(mode,reg) + "'"
						print "t[" + str(opcode) + "]=function(){"
						amode_read(mode, reg, size, False)
						do_operation(name, size, "d" + str(dreg), "s")
						amode_write(mode, reg, size, "r")
						print "}"

build_multi("EOR", 0xB000)
build_multi("ADD", 0xD000)
build_multi("AND", 0xC000)
build_multi("SUB", 0x9000)
build_multi("OR", 0x8000)

def muldiv(name, bits):
	for dreg in range(8):
		for mode in range(8):
			for reg in range(8):
				if valid_source(mode, reg) and mode != MODE_AREG:
					opcode = bits + (dreg << 9) + (mode << 3) + reg
					print "n[" + str(opcode) + "]='" + name + " " + amode_name(mode,reg) + ",D" + str(dreg) + "'"
					print "t[" + str(opcode) + "]=function(){"	
					amode_read(mode, reg, 1)	
					print "	d" + str(dreg) + " = " + name.lower() + "(s,d" + str(dreg) + ");"
					print "}"
					
muldiv("DIVS", 0x81C0)
muldiv("DIVU", 0x80C0)
muldiv("MULS", 0xC1C0)
muldiv("MULU", 0xC0C0)

def build_ext(name, bits):
	for src in range(8):
		for dst in range(8):
			for size in range(3):
				for mem in range(2):
					opcode = bits + (dst << 9) + (size << 6) + (mem << 3) + src
					if mem == 0:
						print "n[" + str(opcode) + "]='" + name + size_name(size) + " D" + str(src) + ",D" + str(dst) + "'"
					else:
						print "n[" + str(opcode) + "]='" + name + size_name(size) + " -(A" + str(src) + "),-(A" + str(dst) + ")'"
					if mem == 0: 
						mode = MODE_DREG
					else:
						mode = MODE_AREG_PREDEC
					print "t[" + str(opcode) + "]=function(){"
					amode_read(mode, src, size)
					print "var c=s;"
					amode_read(mode, dst, size, False)
					print "var n=" + name.lower() + "(c,s," + str(size) + ");"
					amode_write(mode, dst, size, "n")
					print "}"
					
build_ext("ADDX", 0xD100)
build_ext("SUBX", 0x9100)

print "}"
		
############################################################# conditional instructions

print "function build_t_conditional() {"
		
# build all the branches for the given condition, name, and bits
def make_conditionals(condition, name, bits):
	bcc_opcode = 0x6000 + (bits << 8)
	dbcc_opcode = 0x50C8 + (bits << 8)
	scc_opcode = 0x50C0 + (bits << 8)
	# Bcc
	for o in range(0, 256):
		opcode = bcc_opcode + o
		iname = "B" + name
		if iname == "BT":
			iname = "BRA"
		if iname == "BF":
			iname = "BSR"
		if o == 0:
			iname = iname + ".W"
		else:
			iname = iname + ".S"
		print "n[" + str(opcode) + "]='" + iname + "'"
		print "t[" + str(opcode) + "]=function(){"
		if o == 0:
			print "var o=rw(pc);"
			if name == "F":
				amode_write(4, 7, 2, "(pc+2)")
				print "if(true)"
			else:
				print condition
			print "{"
			print "pc+=ewl(o);"
			print "if(pc>4294297295)pc-=4294967296;"
			print "}else pc+= 2;"
		else:
			if name == "F":
				amode_write(4, 7, 2, "pc")
			else:
				print condition
			if o < 128:
				print "pc+=" + str(o) + ";"
			else:
				print "pc-=" + str(256 - o) + ";"				
		print "}"
				
	# DBcc
	for reg in range(0, 8):
		opcode = dbcc_opcode + reg
		print "n[" + str(opcode) + "]='DB" + name + " D" + str(reg) + "'"
		print "t[" + str(opcode) + "]=function(){"
		print condition
		print "pc+=2;"
		print "else{"
		print "var p=d" + str(reg) + ";"
		print "var u=(p>>>16)*65536;"
		print "var l=p%65536;"
		print "var m=(l - 1)&65535;"
		print "d" + str(reg) + "=u+m;"
		print "if(m==65535)"
		print "pc+=2;"
		print "else"
		print "pc=(pc+ewl(rw(pc)))%4294967296;"
		print "}}"
	# Scc
	for reg in range(0,8):
		for mode in range(0,8):
			if valid_dest(mode, reg) and mode != 1:
				opcode = scc_opcode + reg + (mode << 3)
				print "n[" + str(opcode) + "]='S" + name + " " + amode_name(mode,reg) + "'"
				print "t[" + str(opcode) + "]=function(){"
				print condition + "{"
				amode_write(mode, reg, 0, "255")
				print "}else{"
				amode_write(mode, reg, 0, "0")
				print "}}"
		
make_conditionals("if(true)", "T", 0)
make_conditionals("if(false)", "F", 1)
make_conditionals("if(!(sr&5))", "HI", 2)
make_conditionals("if(sr&5)", "LS", 3)
make_conditionals("if(!(sr&1))", "CC", 4)
make_conditionals("if(sr&1)", "CS", 5)
make_conditionals("if(!(sr&4))", "NE", 6)
make_conditionals("if(sr&4)", "EQ", 7)
make_conditionals("if(!(sr&2))", "VC", 8)
make_conditionals("if(sr&2)", "VS", 9)
make_conditionals("if(!(sr&8))", "PL", 10)
make_conditionals("if(sr&8)", "MI", 11)
make_conditionals("if(((sr&10)==0)||((sr&10)==10))", "GE", 12)
make_conditionals("if(((sr&10)==8)||((sr&10)==2))", "LT", 13)
make_conditionals("if((((sr&10)==0)||((sr&10)==10))&(!(sr&4)))", "GT", 14)
make_conditionals("if((sr&4)||((sr&10)==8)||((sr&10)==2))", "LE", 15)

print "}"

################################################################### quick versions of instructions

print "function build_t_quick() {"

# ADDQ / SUBQ
for o in range(-8, 9):
	for mode in range(8):
		for reg in range(8):
			for size in range(3):
				if mode == MODE_AREG and size == 0: continue # no byte operations on a registers
				if valid_dest(mode, reg):
					if o == 0: continue
					if o > 0:
						opcode = 0x5000 + (o << 9)
						if o == 8: opcode = 0x5000
						opcode += (size << 6) + (mode << 3) + reg
						print "n[" + str(opcode) + "]='ADDQ" + size_name(size) + " #" + str(o) + "," + amode_name(mode, reg) + "'"
					else:
						opcode = 0x5100 + ((-o) << 9)
						if o == -8: opcode = 0x5100
						opcode += (size << 6) + (mode << 3) + reg
						print "n[" + str(opcode) + "]='SUBQ" + size_name(size) + " #" + str(-o) + "," + amode_name(mode, reg) + "'"
					print "t[" + str(opcode) + "]=function(){"
					actualsize = size 
					if mode == MODE_AREG: actualsize = 2 # for a registers, always treat as long
					amode_read(mode, reg, actualsize, False)
					if mode == MODE_AREG: 
						# for a registers we don't set condition codes and thus can use a much simpler operation
						print "var r=s+" + str(o) + ";"
					else:
						# regular arithmetic with condition flags set for every other destination
						if size == 0 and o < 0:
							print "var r=subb(" + str(-o) + ", s);" 
						if size == 0 and o > 0:
							print "var r=addb(" + str(o) + ", s);" 
						if size == 1 and o < 0:
							print "var r=subw(" + str(-o) + ", s);" 
						if size == 1 and o > 0:
							print "var r=addw(" + str(o) + ", s);" 
						if size == 2 and o < 0:
							print "var r=subl(" + str(-o) + ", s);" 
						if size == 2 and o > 0:
							print "var r=addl(" + str(o) + ", s);" 
						# copy carry flag into X flag
						print "sr=(sr&0xFFEF)|((sr&1)<<4);"
					amode_write(mode, reg, actualsize, "r")
					print "}"
					
# MOVEQ
for o in range(256):
	for reg in range(0,8):
		opcode = 0x7000 + (reg << 9) + o
		if o < 128: print "n[" + str(opcode) + "]='MOVEQ #" + str(o) + ",D" + str(reg) + "'"
		else: print "n[" + str(opcode) + "]='MOVEQ #" + str(o - 256) + ",D" + str(reg) + "'"
		print "t[" + str(opcode) + "]=function(){"
		if o < 128: print "d" + str(reg) + "=" + str(o) + ";"
		else:  print "d" + str(reg) + "=" + str(0xffffff00 + o) + ";"
		if o == 0: print "sr=(sr&65520)|4;" # set zero flag
		elif o >= 128: print "sr=(sr&65520)|8;" # set negative flag
		else: print "sr&=65520;" # clear all flags (except X)
		print "}"

print "}"

################################################################### shifts

print "function build_t_shift() {"

# build the standard shifting instructions (name is the instruction name and implementing function)

def make_shifts(name, mask, altmask):
	# register target version
	for reg in range(8):
		for size in range(3):
			for shift in range(8):
				for m in (True, False):
					actualshift = shift
					if shift == 0: actualshift = 8
					opcode = mask + 0x20 + (size << 6) + reg + (shift << 9)
					if m:
						opcode = opcode - 0x20
						print "n[" + str(opcode) + "]='" + name + size_name(size) + " #" + str(actualshift) + ",D" + str(reg) + "'"
					else:
						print "n[" + str(opcode) + "]='" + name + size_name(size) + " D" + str(shift) + ",D" + str(reg) + "'"
					print "t[" + str(opcode) + "]=function(){"					
					if m:
						shiftamount = str(actualshift)
					else:
						shiftamount = "d" + str(shift) + "&31"
					if size == 0: src = "d" + str(reg) + "&255"
					if size == 1: src = "d" + str(reg) + "&65535"
					if size == 2: src = "d" + str(reg)
					amode_write(MODE_DREG, reg, size, name.lower() + "(" + src + "," + shiftamount + "," + str(size) + ")")
					print "}"
	# EA target version
	for reg in range(8):
		for mode in range(8):
			if valid_dest(mode, reg) and mode != MODE_DREG and mode != MODE_AREG:
				opcode = altmask + (mode << 3) + reg
				print "n[" + str(opcode) + "]='" + name + ".W " + amode_name(mode, reg) + "'"
				print "t[" + str(opcode) + "]=function(){"
				amode_read(mode, reg, 1, False)
				amode_write(mode, reg, 1, name.lower() + "(s,1,1)")
				print "}"

make_shifts("ASL", 0xE100, 0xE1C0)
make_shifts("ASR", 0xE000, 0xE0C0)					
make_shifts("LSL", 0xE108, 0xE3C0)
make_shifts("LSR", 0xE008, 0xE2C0)	
make_shifts("ROXL", 0xE110, 0xE5C0)
make_shifts("ROXR", 0xE010, 0xE4C0)
make_shifts("ROL", 0xE118, 0xE7C0)
make_shifts("ROR", 0xE018, 0xE6C0)

print "}"

################################################################### miscellaneous

print "function build_t_misc() {"
			
# build a bit operation
def make_bit_operation(name, bits):
	for srcmode in range(0,8):
		for srcreg in range(0,8):
			if valid_dest(srcmode, srcreg) or (name == 'BTST' and srcmode == MODE_MISC and (srcreg == MISCMODE_PC_o or srcreg == MISCMODE_PC_INDEX)):
				for dreg in range(9): # if this value is 8, use bit number static version
					if dreg == 8:
						opcode = bits + (srcmode << 3) + srcreg;
						print "n[" + str(opcode) + "]='" + name + " #nnn," + amode_name(srcmode, srcreg) + "'"
					else:
						opcode = bits + (srcmode << 3) + srcreg - 0x700 + (dreg << 9);
						print "n[" + str(opcode) + "]='" + name + " D" + str(dreg) + "," + amode_name(srcmode, srcreg) + "'"
					print "t[" + str(opcode) + "]=function(){"
					if dreg == 8:
						read_pc(1, "b")
					if (srcmode <= 1):
						# immediate on a register allows using bits 0-31 of the register's full value
						if dreg == 8:
							print "b&=31;"
						else:
							print "b=31&d" + str(dreg)
						amode_read(srcmode, srcreg, 2, name == "BTST")
					else:
						#  immediate elsewhere uses one byte bits 0-7
						if dreg == 8:
							print "b&=7;"
						else:
							print "b=7&d" + str(dreg)
						amode_read(srcmode, srcreg, 0, name == "BTST")
					print "sr|=4;" # set zero flag
					print "if (s&(1<<b))sr=sr&65531;" # clear zero flag if bit is set (nonzero)
					if name != "BTST":
						if (srcmode <= 1):
							# BCLR immediate on a register allows using bits 0-31 of the register's full value
							if name == "BCLR": print "s&=(0xFFFFFFFF-(1<<b));"
							if name == "BSET": print "s|=(1<<b);"
							if name == "BCHG": print "s^=(1<<b);"
							print "if(s<0)s+=4294967296;"
							amode_write(srcmode, srcreg, 2, "s")
						else:
							# BCLR immediate elsewhere uses one byte bits 0-7
							if name == "BCLR": print "s&=(255-(1<<b));"
							if name == "BSET": print "s|=(1<<b);"
							if name == "BCHG": print "s^=(1<<b);"
							amode_write(srcmode, srcreg, 0, "s")
					print "}"
				
make_bit_operation("BCLR", 0x880)
make_bit_operation("BTST", 0x800)
make_bit_operation("BCHG", 0x840)
make_bit_operation("BSET", 0x8c0)
			
# CMP
for size in range(0,3):
	for srcmode in range(0,8):
		for srcreg in range(0,8):
			for firstreg in range(0,8):
				if valid_source(srcmode, srcreg):
					opcode = 0xB000 + (firstreg << 9) + (size << 6) + (srcmode << 3) + srcreg;
					print "n[" + str(opcode) + "]='CMP" + size_name(size) + " " + amode_name(srcmode, srcreg) + ",D" + str(firstreg) + "'";
					print "t[" + str(opcode) + "]=function(){"
					amode_read(srcmode, srcreg, size)
					print "m=d" + str(firstreg) + ";"
					if size == 1: print "m=m&0xFFFF;"
					if size == 0: print "m=m&0xFF;"
					if size == 0: print "subb(s,m);"
					if size == 1: print "subw(s,m);"
					if size == 2: print "subl(s,m);"
					print "}"
					
# CLR / TST
for size in range(0,3):
	for srcmode in range(0,8):
		for srcreg in range(0,8):
			if valid_dest(srcmode, srcreg) and srcmode != MODE_AREG:
				opcode = 0x4200 + (size << 6) + (srcmode << 3) + srcreg;
				print "n[" + str(opcode) + "]='CLR" + size_name(size) + " " + amode_name(srcmode, srcreg) + "'"
				print "t[" + str(opcode) + "]=function(){"
				amode_write(srcmode, srcreg, size, "0")
				print "sr|=4;"
				print "}"
				opcode = 0x4a00 + (size << 6) + (srcmode << 3) + srcreg;
				print "n[" + str(opcode) + "]='TST" + size_name(size) + " " + amode_name(srcmode, srcreg) + "'"
				print "t[" + str(opcode) + "]=function(){"
				amode_read(srcmode, srcreg, size)
				set_condition_flags_data(size, "s")
				print "}"
		
# LEA
for srcmode in range(8):
	for srcreg in range(8):
		for reg in range(8):
			if valid_calc_effective_address(srcmode, srcreg):
				opcode = 0x41C0 + (reg << 9) + (srcmode << 3) + srcreg;
				print "n[" + str(opcode) + "]='LEA " + amode_name(srcmode, srcreg) + ",A" + str(reg) + "'"
				print "t[" + str(opcode) + "]=function(){"
				effective_address_calc(srcmode, srcreg)
				print "a" + str(reg) + "=z;"
				print "}"
				
# PEA
for srcmode in range(8):
	for srcreg in range(8):
		if valid_calc_effective_address(srcmode, srcreg):
			opcode = 0x4840 + (srcmode << 3) + srcreg;
			print "n[" + str(opcode) + "]='PEA " + amode_name(srcmode, srcreg) + "'"
			print "t[" + str(opcode) + "]=function(){"
			effective_address_calc(srcmode, srcreg)
			amode_write(4, 7, 2, "z")
			print "}"
				
# NOP
print "n[0x4E71] = 'NOP';"
print "t[0x4E71]=function(){};"

# JMP / JSR
for mode in range(8):
	for reg in range(8):
		if valid_calc_effective_address(mode, reg):
			for jsr in (True, False):
				if jsr:
					opcode = 0x4E80 + (mode << 3) + reg;
					print "n[" + str(opcode) + "]='JSR " + amode_name(mode, reg) + "'"
				else:
					opcode = 0x4EC0 + (mode << 3) + reg;
					print "n[" + str(opcode) + "]='JMP " + amode_name(mode, reg) + "'"					
				print "t[" + str(opcode) + "]=function(){"
				effective_address_calc(mode, reg)
				if jsr:
					amode_write(4, 7, 2, "pc")
				print "pc=z;"
				print "}"
				
# NOT / NEG / NEGX
for size in range(0,3):
	for srcmode in range(0,8):
		for srcreg in range(0,8):
			if valid_dest(srcmode, srcreg):
				opcode = 0x4600 + (size << 6) + (srcmode << 3) + srcreg;
				print "n[" + str(opcode) + "]='NOT" + size_name(size) + " " + amode_name(srcmode, srcreg) + "'"
				print "t[" + str(opcode) + "]=function(){"
				amode_read(srcmode, srcreg, size, False)
				if size == 0: print "s^=255;"
				if size == 1: print "s^=65535;"
				if size == 2: print "s^=0xFFFFFFFF;"
				set_condition_flags_data(size, "s")
				amode_write(srcmode, srcreg, size, "s")
				print "}"
				
				# should fix overflow here sometime
				opcode = 0x4400 + (size << 6) + (srcmode << 3) + srcreg;
				print "n[" + str(opcode) + "]='NEG" + size_name(size) + " " + amode_name(srcmode, srcreg) + "'"
				print "t[" + str(opcode) + "]=function(){"
				amode_read(srcmode, srcreg, size, False)
				print "	sr &= 0xFFE0;"
				if size == 0: print "var r=256-s;if(r>127)sr|=8;"
				if size == 1: print "var r=65536-s;if(r>=65535)sr|=8;"
				if size == 2: print "var r=0x100000000-s;if(r>0xffffffff)r=0;if(r>0x7fffffff)sr|=8;"
				print "if(r==0)sr|=4;else sr|=17;" # set zero flag for zero, extend and carry otherwise
				amode_write(srcmode, srcreg, size, "r")
				print "}"
				
				opcode = 0x4000 + (size << 6) + (srcmode << 3) + srcreg;
				print "n[" + str(opcode) + "]='NEGX" + size_name(size) + " " + amode_name(srcmode, srcreg) + "'"
				print "t[" + str(opcode) + "]=function(){"
				amode_read(srcmode, srcreg, size, False)
				print "	if(sr&0x10)s++;"
				if size == 0: print "var r=256-s;"
				if size == 1: print "var r=0x10000-s;"
				if size == 2: print "var r=0x100000000-s;if(r>0xffffffff)r=0;"
				set_condition_flags_data(size, "r")
				amode_write(srcmode, srcreg, size, "r")
				print "}"

# SWAP
for reg in range(0,8):
	opcode = 0x4840 + reg;
	print "n[" + str(opcode) + "]='SWAP D" + str(reg) + "'"
	print "t[" + str(opcode) + "]=function(){"
	print "	var lo_word = d" + str(reg) + "&65535;"
	print "	var hi_word = d" + str(reg) + " >>> 16;"
	print "	var reversed = (lo_word * 65536) + hi_word;"
	print "	d" + str(reg) + " = reversed;"
	print "}"
	
# CMPI
for size in range(0,3):
	for srcmode in range(0,8):
		for srcreg in range(0,8):
			if valid_dest(srcmode, srcreg):
				opcode = 0xC00 + (size << 6) + (srcmode << 3) + srcreg;
				print "n[" + str(opcode) + "]='CMPI" + size_name(size) + " #imm," + amode_name(srcmode, srcreg) + "'"
				print "t[" + str(opcode) + "]=function(){"
				read_pc(size, "subtrahend")
				amode_read(srcmode, srcreg, size)
				if size==0: print "	subb(subtrahend, s);"
				if size==1: print "	subw(subtrahend, s);"
				if size==2: print "	subl(subtrahend, s);"
				print "}"
		
# SUBA / CMPA / ADDA
for areg in range(8):
	for srcreg in range(8):
		for srcmode in range(8):
			for size in range(1,3):
				if valid_source(srcmode, srcreg):
					opcode = 0x90C0 + (areg << 9) + ((size - 1) << 8) + (srcmode << 3) + srcreg
					print "n[" + str(opcode) + "]='SUBA" + size_name(size) + " " + amode_name(srcmode, srcreg) + ",A" + str(areg) + "'"
					print "t[" + str(opcode) + "]=function(){"
					amode_read(srcmode, srcreg, size)
					if (size == 1): print "	s = ewl(s);"
					print "var r=" + areg_string(areg) + " - s;"
					print "if(r<0)r+=0x100000000;"
					amode_write(1, areg, 2, "r")
					print "}"
					
					opcode = 0xB0C0 + (areg << 9) + ((size - 1) << 8) + (srcmode << 3) + srcreg
					print "n[" + str(opcode) + "]='CMPA" + size_name(size) + " " + amode_name(srcmode, srcreg) + ",A" + str(areg) + "'"
					print "t[" + str(opcode) + "]=function(){"
					amode_read(srcmode, srcreg, size)
					if (size == 1): print "s=ewl(s);"
					print "subl(s," + areg_string(areg) + ");"
					print "}"
					
					opcode = 0xD0C0 + (areg << 9) + ((size - 1) << 8) + (srcmode << 3) + srcreg
					print "n[" + str(opcode) + "]='ADDA" + size_name(size) + " " + amode_name(srcmode, srcreg) + ",A" + str(areg) + "'"
					print "t[" + str(opcode) + "]=function(){"
					amode_read(srcmode, srcreg, size)
					if (size == 1): print "s=ewl(s);"
					print "var r=" + areg_string(areg) + "+s;"
					print "if(r>0xffffffff)r-=0x100000000;"
					amode_write(1, areg, 2, "r")
					print "}"
										
# various immediate arithmetic instructions given instruction name, constant bits, and function storing in r
def make_immediate(name, mask, operation):
	for reg in range(8):
		for mode in range(8):
			for size in range(3):
				if (valid_dest(mode, reg) and mode != MODE_AREG) or (mode == MODE_MISC and reg == 4 and size < 2 and operation != ""):
					opcode = mask + (size << 6) + (mode << 3) + reg
					mode_name = amode_name(mode, reg)
					if mode == MODE_MISC and reg == 4 and size == 0: mode_name = "CCR"
					if mode == MODE_MISC and reg == 4 and size == 1: mode_name = "SR"
					print "n[" + str(opcode) + "]='" + name + size_name(size) + " #nnn," + mode_name + "'"
					print "t[" + str(opcode) + "]=function(){"
					read_pc(size, "m")
					if mode == MODE_MISC and reg == 4:
						if size == 0 and name == "ANDI": print "m|=0xFF00;"
						print "	update_sr(sr " + operation[7] + " m);"
					else:
						amode_read(mode, reg, size, False)
						if operation != "":
							print operation
							set_condition_flags_data(size, "r")
						else:
							print "	var r = " + name[0:3].lower() + size_name(size)[1].lower() + "(m, s);"
						amode_write(mode, reg, size, "r")
					print "}"
				
make_immediate("ORI", 0, "var r=s|m;")
make_immediate("ANDI", 0x200, "var r=s&m;")	
make_immediate("EORI", 0xA00, "var r=s^m;")	
make_immediate("ADDI", 0x600, "")
make_immediate("SUBI", 0x400, "")

# MOVE USP
for reg in range(8):
	for mode in range(8):			
		opcode = 0x4e60 + reg
		print "n[" + str(opcode) + "]='MOVE A" + str(reg) + ",USP'"
		print "t[" + str(opcode) + "]=function(){"
		print "if(sr&0x2000==0)throw 8;"
		print "a8=a" + str(reg) + ";"
		print "}"
		opcode = 0x4e68 + reg
		print "n[" + str(opcode) + "]='MOVE USP,A" + str(reg) + "'"
		print "t[" + str(opcode) + "]=function(){"
		print "if(sr&0x2000==0)throw 8;"
		print "a" + str(reg) + "=a8;"
		print "}"			

# MOVEM
for reg in range(8):
	for mode in range(8):
		for size in range(1,3):
			actualsize = size * 2
			# from registers
			if mode in (MODE_AREG_INDIRECT, MODE_AREG_PREDEC, MODE_AREG_OFFSET, MODE_AREG_INDEX) or (mode == MODE_MISC and (reg in (MISCMODE_SHORT, MISCMODE_LONG))):
				opcode = 0x4880 + ((size - 1) << 6) + (mode << 3) + reg
				print "n[" + str(opcode) + "]='MOVEM" + size_name(size) + " regs," + amode_name(mode, reg) + "'"
				print "t[" + str(opcode) + "]=function(){"
				read_pc(1, "regs")
				if mode == MODE_AREG_PREDEC:
					print "	store_multiple_predec(" + str(reg) + ", regs, " + str(size) + ");"
				else:
					effective_address_calc(mode, reg)
					print "	store_multiple(z, regs, " + str(size) + ");"
				print "}"
			# to registers
			if mode in (MODE_AREG_INDIRECT, MODE_AREG_POSTINC, MODE_AREG_OFFSET, MODE_AREG_INDEX) or (mode == MODE_MISC and (reg in (MISCMODE_SHORT, MISCMODE_LONG, MISCMODE_PC_o, MISCMODE_PC_INDEX))):
				opcode = 0x4c80 + ((size - 1) << 6) + (mode << 3) + reg
				print "n[" + str(opcode) + "]='MOVEM" + size_name(size + 1) + " " + amode_name(mode, reg) + ",regs'"
				print "t[" + str(opcode) + "]=function(){"
				read_pc(1, "regs")
				if mode == MODE_AREG_POSTINC:
					print "load_multiple_postinc(" + str(reg) + ",regs," + str(size) + ");"
				else:
					effective_address_calc(mode, reg)
					print "load_multiple(z,regs," + str(size) + ");"
				print "}"			

# LINK
for areg in range(8):
	opcode = 0x4e50 + areg
	print "n[" + str(opcode) + "]='LINK #nnn,A" + str(areg) + "'"
	print "t[" + str(opcode) + "]=function(){"
	amode_write(MODE_AREG_PREDEC, 7, 2, areg_string(areg))
	read_pc(1, "o")
	print areg_string(areg) + "=" + areg_string(7) + ";"
	print areg_string(7) + "+=(o<0x8000?o:o-0x10000);"
	print "}"

# RTS
print "n[0x4E75] = 'RTS';"
print "t[0x4E75]=function(){"
amode_read(MODE_AREG_POSTINC, 7, 2)
print "	pc = s;"
print "}"

# UNLK
for reg in range(8):
	opcode = 0x4e58 + reg;
	print "n[" + str(opcode) + "]='UNLK A" + str(reg) + "'"
	print "t[" + str(opcode) + "]=function(){"
	print "	" + areg_string(7) + " = " + areg_string(reg) + ";"
	amode_read(MODE_AREG_POSTINC, 7, 2)
	print "	" + areg_string(reg) + " = s;"
	print "}"
	
# EXT
for reg in range(8):
	for size in range(1,3):
		opcode = 0x4800 + reg + ((size + 1) << 6)
		print "n[" + str(opcode) + "]='EXT" + size_name(size) + " D" + str(reg) + "'"
		print "t[" + str(opcode) + "]=function(){"
		if size == 1:
			print "	d" + str(reg) + " = ebw(d" + str(reg) + ");"
		if size == 2:
			print "	d" + str(reg) + " = ewl(d" + str(reg) + ");"
		print "}"
	
# TRAP
for vector in range(16):
	opcode = 0x4e40 + vector
	print "n[" + str(opcode) + "]='TRAP #" + str(vector) + "'"
	print "t[" + str(opcode) + "]=function(){"
	print "	throw(" + str(32 + vector) + ");"
	print "}"
	
# RTE
print "n[0x4E73] = 'RTE';"
print "t[0x4E73]=function(){"
amode_read(MODE_AREG_POSTINC, 7, 1)
print "	var n = s;"
amode_read(MODE_AREG_POSTINC, 7, 2)
print "	pc = s;"
print "	update_sr(n);"
print "}"

# CMPM
for src in range(8):
	for dest in range(8):
		for size in range(3):
			opcode = 0xB108 + (dest << 9) + (size << 6) + src
			print "n[" + str(opcode) + "]='CMPM" + size_name(size) + " (A" + str(src) + ")+,(A" + str(dest) + ")+'"
			print "t[" + str(opcode) + "]=function(){"
			amode_read(MODE_AREG_POSTINC, src, size)
			print "var u=s;"
			amode_read(MODE_AREG_POSTINC, dest, size)
			if size == 0: print "subb(u,s);"
			if size == 1: print "subw(u,s);"
			if size == 2: print "subl(u,s);"
			print "}"
			
# ABCD / SBCD
for src in range(8):
	for dest in range(8):
		for memory in (True, False):
			for operation in ("ABCD", "SBCD"):
				opcode = 0x8100 + (dest << 9) + src
				if operation == "ABCD":	opcode = opcode + 0x4000
				if memory: 
					opcode += 8
					print "n[" + str(opcode) + "]='" + operation + " -(A" + str(src) + "),-(A" + str(dest) + ")'"
				else:
					print "n[" + str(opcode) + "]='" + operation + " D" + str(src) + ",D" + str(dest) + "'"
				print "t[" + str(opcode) + "]=function(){"
				if memory:
					amode_read(MODE_AREG_PREDEC, src, 0)
					print "	var other = s;"
					amode_read(MODE_AREG_PREDEC, dest, 0)
					amode_write(MODE_AREG_INDIRECT, dest, 0, operation.lower() + "(s,other)");
				else:
					deststr = "d" + str(dest) + ""
					print deststr + "+=" + operation.lower() + "(" + deststr + ",d" + str(src) + ")-" + deststr + "&0xFF;"
				print "}"
				
# EXG
def make_exchange(xtype, ytype, bits):
	for x in range(8):
		for y in range(8):
			opcode = bits + (x << 9) + y
			print "n[" + str(opcode) + "]='EXG " + xtype + str(x) + "," + ytype + str(y) + "'"
			print "t[" + str(opcode) + "]=function(){"
			if xtype == "D":
				xstr = "d" + str(x)
			else:
				xstr = areg_string(x)
			if ytype == "D":
				ystr = "d" + str(y)
			else:
				ystr = areg_string(y)
			print "var e=" + xstr + ";"
			print xstr + "=" + ystr + ";"
			print ystr + "=e;"
			print "}"

make_exchange("D", "D", 0xC140)
make_exchange("A", "A", 0xC148)
make_exchange("D", "A", 0xC188)
				
print "}"