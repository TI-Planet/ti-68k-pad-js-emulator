import java.math.*;
import java.io.*;
import java.lang.*;

final public class jemucalc
{
	short ram[] = new short[0x20000];
	short rom[] = new short[0x100000];
	jemuproc proc; 
	boolean onpressed;
	int timer_current = 0;
	int timer_min = 0xB2;
	int osc2_counter;
	byte keystate[] = new byte[8];
	byte keymask = (byte)0xFF;
	boolean protect[] = new boolean[0x20000];
	int lcdhigh = 0x09;
	int lcdlow = 0x80;
	int screenheight = 128;
	
	int lcdstart()
	{
		return ((lcdhigh << 11) | (lcdlow << 3)) & 0x3FFFF;
	}
	
	static int extractlong(byte[] array, int offset)
	{
		int sum = 0;
		for (int x = offset + 3; x >= offset; x--)
		{
			sum <<= 8;
			int b = array[x] & 0xFF;
			sum |= b;
		}
		return sum;
	}
	
	InputStream openfile(String filename) throws IOException
	{
		try
		{
			return Thread.currentThread().getContextClassLoader().getResourceAsStream(filename);
		}
		catch (Exception e)
		{
			return new FileInputStream(filename); 
		}
	}	
	
	jemucalc()
	{
		proc = new jemuproc(this);
		for (int x = 0; x < 8; x++) keystate[x] = (byte)0xFF;
		try
		{
			for (int x = 0; x < 0x9000; x++) rom[x] = 0x1400;
			for (int x = 0x9000; x < 0x100000; x++) rom[x] = (short) 0xFFFF;

			/*byte[] raw = new byte[0x200000];
			FileInputStream in = new FileInputStream("TI89_105.ROM");
			in.read(raw);
			for (int addr = 0; addr < 0x200000; addr += 2)
			{
				int lo = (raw[addr + 1]) & 0xFF;
				rom[addr >> 1] = (short)((raw[addr] << 8) | lo);
			}*/
			
			byte[] raw = new byte[800000];	
			InputStream in = openfile("pedrom-89.tib");					
			int totalread = 0;
			while (in.available() > 0)
			{
				totalread += in.read(raw, totalread, in.available());
			}
			
			for (int addr = 0; addr < totalread; addr += 2)
			{
				int lo = (raw[addr + 1]) & 0xFF;
				rom[0x9000 + (addr >> 1)] = (short)((raw[addr] << 8) | lo);
			}
			
			in = openfile("pedrom-89.sav");
			totalread = 0;
			while (in.available() > 0)
			{
				totalread += in.read(raw, totalread, in.available());
			}
	
			for (int addr = 0; addr < 0x40000; addr += 2)
			{
				int lo = (raw[addr + 257]) & 0xFF;			
				ram[(addr >> 1)] = (short)((raw[addr + 256] << 8) | lo);
			}
			
			// Initialize register values
			proc.setsr((short)extractlong(raw, 0x96));
			proc.pc = extractlong(raw, 0x90);
			for (int x = 0; x < 16; x++)
				proc.amodes[x].writelong(extractlong(raw, 0x44 + x * 4));
			proc.a8 = extractlong(raw, proc.supervisor ? 0x84 : 0x88);
		}
		catch (Exception e)
		{
			System.out.println(e);
		}
	}	
	
	void keydown(int row, int col)
	{
		if (row == -1) onpressed = true; else keystate[row] &= (byte)(0xFF - (1 << col));
	}
	
	void keyup(int row, int col)
	{
		if (row == -1) onpressed = false; else keystate[row] |= (byte)(1 << col);
	}
	
	byte readbyte(int address)
	{
		address &= 0xFFFFFF; // high bits always ignored for 68K
		if (address < 0x200000) 
		{
			short value = ram[(address & 0x3FFFF) >> 1];
			return (address & 1) == 0 ? (byte)(value >> 8) : (byte)value;
		}
		if (address < 0x400000)
		{
			short value = rom[(address - 0x200000) >> 1];
			return (address & 1) == 0 ? (byte)(value >> 8) : (byte)value;
		}
		address &= 0xF0001F; // for hardware registers ignore middle bits
		if (address == 0x600017) return (byte)timer_current; // current count of programmable timer
		if (address == 0x600019) return keymask; // read back key mask 
		if (address == 0x60001A) return onpressed ? (byte)0 : (byte)0xFF; // ON key
		if (address == 0x60001B) // read keyboard status
		{
			byte result = (byte)0xFF;
			for (int row = 0; row < 8; row++)
			{
				if ((keymask & (1 << row)) == 0)
				{
					result &= keystate[row];
				}
			}			
			return result;
		}
		return 0;
	}
	
	short readword(int address)
	{
		address &= 0xFFFFFF; // high bits always ignored for 68K
		if (address < 0x200000)
			return ram[(address & 0x3FFFF) >> 1];
		if (address < 0x400000)
			return rom[(address - 0x200000) >> 1];
		return (short)((readbyte(address) << 8) | (0xFF & readbyte(address + 1)));
	}
	
	int readlong(int address)
	{
		return ((readword(address)) << 16) | (0xFFFF & readword(address + 2));
	}
	
	void writebyte(int address, byte value)
	{
		address &= 0xFFFFFF;
		if (address < 0x200000)
		{
			//if (protect[(address & 0x3FFFF) >> 1]) System.out.println("Writing " + proc.to_hex(value, 2) + " to protected address " + proc.to_hex(address, 8) + " at PC " + proc.to_hex(proc.pc, 8) + " SP " + proc.to_hex(proc.a7, 8));
			if ((address & 1) == 0)
				ram[(address & 0x3FFFF) >> 1] = (short) ((ram[(address & 0x3FFFF) >> 1] & 0xFF) | (value << 8));
			else
				ram[(address & 0x3FFFF) >> 1] = (short) ((ram[(address & 0x3FFFF) >> 1] & 0xFF00) | (value & 0xFF));
		}			
		address &= 0xF0001F; // for hardware registers ignore middle bits
		if (address == 0x600017) { timer_min = timer_current = (value & 0xFF); } // reset programmable timer
		if (address == 0x600019) { keymask = value; } // select keyboard rows
		if (address == 0x600010) { lcdhigh = value & 0xFF; }
		if (address == 0x600011) { lcdlow = value & 0xFF; }
		if (address == 0x600013) { screenheight = value & 0xFF; }
	}
	
	void writeword(int address, short value)
	{
		address &= 0xFFFFFF;
		if (address < 0x200000)
		{
			//if (protect[(address & 0x3FFFF) >> 1]) System.out.println("Writing " + proc.to_hex(value, 4) + " to protected address " + proc.to_hex(address, 8) + " at PC " + proc.to_hex(proc.pc, 8) + " SP " + proc.to_hex(proc.a7, 8));
			ram[(address & 0x3FFFF) >> 1] = value;
			return;
		}
		writebyte(address, (byte)(value >> 8));
		writebyte(address + 1, (byte)(value & 0xFF));
	}
	
	void protectlong(int address)
	{
		//if (address == 0x4B90) System.out.println("protecting!!!!!!!!!!!!!!"+ " at PC " + proc.to_hex(proc.pc, 8));
		protect[(address & 0x3FFFF) >> 1] = true;
		protect[((address & 0x3FFFF) >> 1) + 1] = true;
	}
	void unprotectlong(int address)
	{
		//if (address == 0x4B90) System.out.println(">>>>>unprotecting!!!!!!!!!!!!!!"+ " at PC " + proc.to_hex(proc.pc, 8));
		protect[(address & 0x3FFFF) >> 1] = false;
		protect[((address & 0x3FFFF) >> 1) + 1] = false;
	}
	
	void writelong(int address, long value)
	{
		writeword(address, (short) (value >>> 16));
		writeword(address + 2, (short) (value & 0xFFFF));
	}
	
	void runframe()
	{
		for (int x = 0; x < (256 - screenheight) * 2; x++)
		{
			proc.run64();
			osc2_counter += 32;
			if ((osc2_counter & 0x7ff) == 0) proc.fireexception(25);
			if ((osc2_counter & 0x1ff) == 0) // this mask should be user switchable
			{
				if (timer_current == 0) timer_current = timer_min; else timer_current++;
				if (timer_current == 256)
				{
					timer_current = 0;
					proc.fireexception(29);
				}
			}
		}
	}
}