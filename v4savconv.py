infile = open("pedrom.sav", "rb")
outfile = open("v4sav.js", "w")

o = 0
sav = infile.read()

def readbytes(offset, count):
	val = 0
	for byte in range(count - 1, -1, -1):
		val = val * 256
		val = val + ord(sav[byte + offset])
	return val

def readlong(offset):
	return readbytes(offset, 4)
	
def readword(offset):
	return readbytes(offset, 2)

outfile.write("function reset() {\n")

sr = readword(0x96)

for dreg in range(8):
	outfile.write("d" + str(dreg) + " = " + str(readlong(0x44 + dreg * 4)) + ";\n")
for areg in range(7):
	outfile.write("a" + str(areg) + " = " + str(readlong(0x64 + areg * 4)) + ";\n")

if (sr & 0x2000) == 0x2000:
	outfile.write("a8 = " + str(readlong(0x84)) + ";\n") # user stack pointer
	outfile.write("a7 = " + str(readlong(0x80)) + ";\n") # supervisor stack pointer
else:
	outfile.write("a7 = " + str(readlong(0x80)) + ";\n") # user stack pointer
	outfile.write("a8 = " + str(readlong(0x88)) + ";\n") # supervisor stack pointer

outfile.write("sr = " + str(sr) + ";\n");

outfile.write("pc = " + str(readlong(0x90)) + ";\n")

print "registers done!"

outfile.write("ram = sram.slice(0);\n")

outfile.write("};\n")

for b in range(0, 0x40000, 2):
	if b % 1024 == 0:
		if b == 0:
			outfile.write("var sram = new Array(")
		else:
			outfile.write("sram.push(")
	else:
		outfile.write(",")
		
	outfile.write(str(ord(sav[b + 0x100]) * 256 + ord(sav[b + 0x101])))
	if b % 1024 == 1022:
		outfile.write(");\n")	

print "ram done!"

outfile.close()

print "done completely!"
