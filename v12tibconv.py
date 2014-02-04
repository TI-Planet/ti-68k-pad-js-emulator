#!/usr/bin/python
import os;
import sys;

# "ti92plus_2.09.tib"
# "ti89_209.89u"
# "tivoyage200_3.10.v2u"
# "ti89t_3.10.89u"

print "Opening " + sys.argv[1] + "."
infile = open(sys.argv[1], "rb")
outfile = open("v12rom.js", "w")

o = 0
high = 0
start = 0
rombase = 0
flashsize = 0
offset = 0
stride = 0x100 / 2

# Does this look like a .xxu file ?
header = infile.read(8)
if header == "**TIFL**" :
    infile.seek(9, os.SEEK_CUR)
    header = infile.read(8)
    if header == "basecode":
        # Yup, it is.
        print "Found basecode"
        start = 0x4E
    else:
        # Nope, assume TIB.
        print "Not found basecode, assuming TIB"
        # start = 0
else:
    # Nope, assume TIB.
    print "Not found **TIFL**, assuming TIB"
    # start = 0

infile.seek(start + 6, os.SEEK_SET)
model = infile.read(3)
if model == "\x80\x11\x01":
    print "Detected 92+, 2 MB of Flash"
    rombase = 0x400000;
    flashsize = 0x200000;
elif model == "\x80\x11\x03":
    print "Detected 89, 2 MB of Flash"
    rombase = 0x200000;
    flashsize = 0x200000;
elif model == "\x80\x11\x08":
    print "Detected V200, 4 MB of Flash"
    rombase = 0x200000;
    flashsize = 0x400000;
elif model == "\x80\x11\x09":
    print "Detected 89T, 4 MB of Flash"
    rombase = 0x800000;
    flashsize = 0x400000;
else:
    print "Don't understand this file, bailing out"
    sys.exit(1)
model = str(ord(model[2]));

infile.seek(start, os.SEEK_SET)

outfile.write("var rom = new Uint16Array(" + str(flashsize) + " / 2);\n")

# Fill from ROM_base to ROM_base + 0x12000 with 0xFF.
outfile.write("for (var i = 0; i < 0x12000; i += 256) {\n");
buf = ""
for i in range(0, stride - 1):
	buf = buf + "5120," # 0x1400, shorter
buf += "5120"
outfile.write("rom.set([" + buf + "], i / 2);\n");
outfile.write("}\n");

# Fill from ROM_base + 0x12000 to end of OS with OS contents.
buf = ""
offset = 0x12000 / 2
for b in infile.read():
	if o % 2 == 0:
		high = ord(b) * 256
	else:
		buf = buf + str(high + ord(b)) + ","
	o = o + 1
	if o % stride == 0:
		outfile.write("rom.set([" + buf[:-1] + "], " + str(offset) + ");\n");
		buf = ""
		offset += stride / 2;

if o % 2 == 1:
	buf += str(high);

# Fill until the end of this block.
while o % stride != stride - 1:
	buf += "65535,"
	o = o + 1

buf += "65535"
outfile.write("rom.set([" + buf + "]," + str(offset) + ");\n");
offset += stride;

# Fill until the end of the Flash memory.
#for offset in range(offset, flashsize, stride * 2):
#	buf = ""
#	for i in range(0, stride - 1):
#		buf = buf + "65535,"
#	buf += "65535"
#	outfile.write("rom.set([" + buf + "], " + str(o) + "/ 2);\n");


outfile.write("var offset = " + str(offset) + ";\n");
outfile.write("while (offset < rom.length) {\n");
outfile.write("rom[offset] = 0xFFFF;\n"); # FFFE, for instance, in order to test the Flash memory erase code
outfile.write("offset++; }\n");

outfile.write("// HWPB\n");
outfile.write("rom[0x104 / 2] = 0x00" + str(rombase / 1048576) + "0;\n"); # Address of the HWPB
outfile.write("rom[0x106 / 2] = 0x0108;\n");
outfile.write("rom[0x108 / 2] = 0x0018;\n"); # Size of the HWPB
outfile.write("rom[0x10A / 2] = 0x0000;\n"); # Hardware ID
outfile.write("rom[0x10C / 2] = 0x000" + model + ";\n");
outfile.write("rom[0x10E / 2] = 0x0000;\n"); # Hardware revision
outfile.write("rom[0x110 / 2] = 0x0001;\n");
outfile.write("rom[0x112 / 2] = 0x0000;\n"); # Boot major
outfile.write("rom[0x114 / 2] = 0x0001;\n");
outfile.write("rom[0x116 / 2] = 0x0000;\n"); # Boot revision
outfile.write("rom[0x118 / 2] = 0x0001;\n");
outfile.write("rom[0x11A / 2] = 0x0000;\n"); # Boot build
outfile.write("rom[0x11C / 2] = 0x0001;\n");
outfile.write("rom[0x11E / 2] = 0x0000;\n"); # Gate array
outfile.write("rom[0x120 / 2] = 0x000");
if model == "9":
	outfile.write("3"); # HW3 for 89T
elif model == "8":
	outfile.write("2"); # HW2 for V200
else:
	outfile.write("1"); # HW1 for 89 & 92+
outfile.write(";\n");
