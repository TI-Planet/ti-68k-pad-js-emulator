infile = open("d:\\ti\\vti\\pedrom.tib", "rb")
outfile = open("v4rom.js", "w")

o = 0
high = 0

outfile.write("var rom = new Array();\n")
outfile.write("for (var x = 0; x < 0x12000; x += 2) { rom.push(0x1400); }\n")

for b in infile.read():
	if o % 2 == 0:
		high = ord(b) * 256
	else:
		if o == 1:
			outfile.write("rom.push(")
		else:
			outfile.write(",")
		outfile.write(str(high + ord(b)))
	
	o = o + 1
	
	if o == 1024:
		o = 0
		outfile.write(");\n")	

if o % 2 == 1:
	outfile.write(str(high));
		
if o > 0:
	outfile.write(");\n")

outfile.write("while (rom.length < 0x100000) rom.push(0xFFFF);\n")