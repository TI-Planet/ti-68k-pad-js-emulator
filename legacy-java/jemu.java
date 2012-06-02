import java.applet.*;
import java.awt.*;
import java.awt.image.*;
import java.awt.event.*;
import java.lang.*;
import java.util.*;
import java.math.*;

final public class jemu extends Applet implements Runnable, KeyListener {
    Graphics og;
    Image oi;
	long runs;
	long timetotal;
	int[][] smallGrid;
	int[] screenGrid;
	int frame;
	BufferedImage smallImage;
	WritableRaster smallRaster;
	jemucalc calc = new jemucalc();
	calcbutton[] buttons = new calcbutton[50];
	
    public void init() {
        oi = createImage(320, 200);
        og = oi.getGraphics();
		smallGrid = new int[3][100 * 160];
		screenGrid = new int[100 * 160];
		smallImage = new BufferedImage(160, 100, BufferedImage.TYPE_INT_ARGB);
		
		setLayout(null);
		buttons[0] = new calcbutton(calc, "F1", 5, 7);
		buttons[1] = new calcbutton(calc, "F2", 4, 7);
		buttons[2] = new calcbutton(calc, "F3", 3, 7);
		buttons[3] = new calcbutton(calc, "F4", 2, 7);
		buttons[4] = new calcbutton(calc, "F5", 1, 7);
		buttons[5] = new calcbutton(calc, "2nd", 0, 4);
		buttons[6] = new calcbutton(calc, "ESC", 6, 0); 
		buttons[7] = new calcbutton(calc, "Shift", 0, 5); 
		buttons[8] = new calcbutton(calc, "Up", 0, 0);
		buttons[9] = new calcbutton(calc, "APPS", 5, 0); 
		buttons[10] = new calcbutton(calc, "Diamond", 0, 6);
		buttons[11] = new calcbutton(calc, "ALPHA", 0, 7);
		buttons[12] = new calcbutton(calc, "Left", 0, 1);
		buttons[13] = new calcbutton(calc, "Down", 0, 2);
		buttons[14] = new calcbutton(calc, "Right", 0, 3);
		buttons[15] = new calcbutton(calc, "HOME", 5, 6);
		buttons[16] = new calcbutton(calc, "MODE", 4, 6);
		buttons[17] = new calcbutton(calc, "CATALOG", 3, 6);
		buttons[18] = new calcbutton(calc, "Backspace", 2, 6);
		buttons[19] = new calcbutton(calc, "CLEAR", 1, 6);
		buttons[20] = new calcbutton(calc, "X", 5, 5);
		buttons[21] = new calcbutton(calc, "Y", 4, 5);
		buttons[22] = new calcbutton(calc, "Z", 3, 5);
		buttons[23] = new calcbutton(calc, "T", 2, 5);
		buttons[24] = new calcbutton(calc, "^", 1, 5);
		buttons[25] = new calcbutton(calc, "=", 5, 4);
		buttons[26] = new calcbutton(calc, "(", 4, 4);
		buttons[27] = new calcbutton(calc, ")", 3, 4);
		buttons[28] = new calcbutton(calc, ",", 4, 2);
		buttons[29] = new calcbutton(calc, "/", 1, 4);
		buttons[30] = new calcbutton(calc, "|", 5, 3);
		buttons[31] = new calcbutton(calc, "7", 4, 3);
		buttons[32] = new calcbutton(calc, "8", 3, 3);
		buttons[33] = new calcbutton(calc, "9", 2, 3);
		buttons[34] = new calcbutton(calc, "*", 1, 3);
		buttons[35] = new calcbutton(calc, "EE", 5, 2);
		buttons[36] = new calcbutton(calc, "4", 4, 2);
		buttons[37] = new calcbutton(calc, "5", 3, 2);
		buttons[38] = new calcbutton(calc, "6", 2, 2);
		buttons[39] = new calcbutton(calc, "-", 1,2);
		buttons[40] = new calcbutton(calc, "STO>", 5, 1);
		buttons[41] = new calcbutton(calc, "1", 4, 1);
		buttons[42] = new calcbutton(calc, "2", 3, 1);
		buttons[43] = new calcbutton(calc, "3", 2, 1);
		buttons[44] = new calcbutton(calc, "+", 1, 1);
		buttons[45] = new calcbutton(calc, "ON", -1, -1);
		buttons[46] = new calcbutton(calc, "0", 4, 0);
		buttons[47] = new calcbutton(calc, ".", 3, 0);
		buttons[48] = new calcbutton(calc, "(-)", 2, 0);
		buttons[49] = new calcbutton(calc, "ENTER", 1, 0);
		
		for (int b = 0; b < 50 ; b++)
		{
			add(buttons[b]);
			int screenrow = b / 5;
			int screencol = b % 5;
			buttons[b].setBounds(screencol * 64 + 2, screenrow * 60 + 202, 60, 56);
			buttons[b].addKeyListener(this);
		}
		addKeyListener(this);
    }

    public void start() {
        Thread t = new Thread(this);
        t.start();
    }

    public void run() {
        while (true) {
			long startingtime = System.nanoTime();
			calc.runframe();
			
			int z = 0;
			int address = calc.lcdstart() / 2;
			
			frame++;
			if (frame >= 3) frame = 0;
			
			for (int y = 0; y < 100; y++)
			{
				for (int x = 0; x < 10; x++)
				{
					short word = calc.ram[address++];
					for (int bit = 15; bit >= 0; bit--)
					{
						smallGrid[frame][z++] = (word & 0x8000) == 0 ? 0x55555555 : 0x55000000;
						word <<= 1;
					}
				}
				address += 5; // skip words not used on TI89
			}
			
			for (z = 0; z < 160 * 100; z++) screenGrid[z] = smallGrid[0][z] + smallGrid[1][z] + smallGrid[2][z];
			smallImage.setRGB(0, 0, 160, 100, screenGrid, 0, 160);		

			repaint();
			
			long endingtime = System.nanoTime();
			long billion = 1000000000;
			long runtime = ((endingtime - startingtime) % billion + billion) % billion;
			
			int milliseconds = (int)(runtime / 1000000);
			
			timetotal += runtime;
		
			if ((++runs) == 1000)
			{
				System.out.println("Average nanoseconds to run last 1000 frames : " + timetotal / runs);
				timetotal = runs = 0;
			}
			
			try {
				// Calculate time to delay before starting next frame as long enough to average 10.5 milliseconds between frames.
				// Always wait at least 1 millisecond to avoid using all the CPU time here.
				int delay = Math.max(1, 10 - milliseconds);
                Thread.sleep(delay);
            } catch (Exception e) {
            }
        }
    }

    public void update(Graphics g) {
        paint(g);
    }

    public void paint(Graphics g) 
	{							
		g.drawImage(smallImage, 0, 0, 320, 200, 0, 0, 160, 100, null); 
    }
	
	int getrc(KeyEvent e)
	{
		if (e.getKeyCode() == KeyEvent.VK_UP) return 0;
		if (e.getKeyCode() == KeyEvent.VK_LEFT) return 1;
		if (e.getKeyCode() == KeyEvent.VK_DOWN) return 2;
		if (e.getKeyCode() == KeyEvent.VK_RIGHT) return 3;
		if (e.getKeyCode() == KeyEvent.VK_CONTROL) return 4; // 2nd key
		if (e.getKeyCode() == KeyEvent.VK_SHIFT) return 5;
		if (e.getKeyCode() == KeyEvent.VK_BACK_QUOTE) return 6; // DIAMOND key
		if (e.getKeyCode() == KeyEvent.VK_CAPS_LOCK) return 7; // ALPHA key
		if (e.getKeyCode() == KeyEvent.VK_ENTER) return 0x10;
		if (e.getKeyCode() == KeyEvent.VK_PLUS) return 0x11;
		if (e.getKeyCode() == KeyEvent.VK_MINUS) return 0x12;
		if (e.getKeyCode() == KeyEvent.VK_MULTIPLY) return 0x13;
		if (e.getKeyCode() == KeyEvent.VK_DIVIDE) return 0x14;
		if (e.getKeyCode() == KeyEvent.VK_SLASH) return 0x14;
		if (e.getKeyCode() == KeyEvent.VK_P) return 0x15;
		if (e.getKeyCode() == KeyEvent.VK_C) return 0x16;
		if (e.getKeyCode() == KeyEvent.VK_F5) return 0x17;
		if (e.getKeyCode() == KeyEvent.VK_F4) return 0x27;
		if (e.getKeyCode() == KeyEvent.VK_F3) return 0x37;
		if (e.getKeyCode() == KeyEvent.VK_F2) return 0x47;
		if (e.getKeyCode() == KeyEvent.VK_F1) return 0x57;
		if (e.getKeyCode() == KeyEvent.VK_SPACE) return 0x20;
		if (e.getKeyCode() == KeyEvent.VK_3) return 0x21;
		if (e.getKeyCode() == KeyEvent.VK_6) return 0x22;
		if (e.getKeyCode() == KeyEvent.VK_9) return 0x23;
		if (e.getKeyCode() == KeyEvent.VK_COMMA) return 0x24;
		if (e.getKeyCode() == KeyEvent.VK_T) return 0x25;
		if (e.getKeyCode() == KeyEvent.VK_BACK_SPACE) return 0x26;
		if (e.getKeyCode() == KeyEvent.VK_PERIOD) return 0x30;
		if (e.getKeyCode() == KeyEvent.VK_2) return 0x31;
		if (e.getKeyCode() == KeyEvent.VK_5) return 0x32;
		if (e.getKeyCode() == KeyEvent.VK_8) return 0x33;
		if (e.getKeyCode() == KeyEvent.VK_CLOSE_BRACKET) return 0x33;
		if (e.getKeyCode() == KeyEvent.VK_Z) return 0x34;
		if (e.getKeyCode() == KeyEvent.VK_G) return 0x35;
		if (e.getKeyCode() == KeyEvent.VK_0) return 0x40;
		if (e.getKeyCode() == KeyEvent.VK_1) return 0x41;
		if (e.getKeyCode() == KeyEvent.VK_4) return 0x42;
		if (e.getKeyCode() == KeyEvent.VK_7) return 0x43;
		if (e.getKeyCode() == KeyEvent.VK_OPEN_BRACKET) return 0x44;
		if (e.getKeyCode() == KeyEvent.VK_Y) return 0x45;
		if (e.getKeyCode() == KeyEvent.VK_M) return 0x46;
		if (e.getKeyCode() == KeyEvent.VK_A) return 0x50;
		if (e.getKeyCode() == KeyEvent.VK_S) return 0x51;
		if (e.getKeyCode() == KeyEvent.VK_E) return 0x52;
		if (e.getKeyCode() == KeyEvent.VK_F) return 0x53;
		if (e.getKeyCode() == KeyEvent.VK_EQUALS) return 0x54;
		if (e.getKeyCode() == KeyEvent.VK_X) return 0x55;
		if (e.getKeyCode() == KeyEvent.VK_H) return 0x56;
		if (e.getKeyCode() == KeyEvent.VK_ESCAPE) return 0x60;
		if (e.getKeyCode() == KeyEvent.VK_O) return -1;
		return 0x77;
	}
	
	public void keyPressed(KeyEvent e)
	{
		int rc = getrc(e);
		calc.keydown(rc >> 4, rc & 15);
	}
	
	public void keyReleased(KeyEvent e) 
	{
		int rc = getrc(e);
		calc.keyup(rc >> 4, rc & 15);
	}
	
	public void keyTyped(KeyEvent e)
	{
	}
}

final class calcbutton extends Button
{
	int row, col;
	jemucalc calc;
	public calcbutton(jemucalc calc, String title, int row, int col) 
	{ 
		super(title); 
		this.calc = calc;
		this.row = row; 
		this.col = col; 
		enableEvents(AWTEvent.MOUSE_EVENT_MASK);
	}
	public void processMouseEvent(MouseEvent e)
	{
		if (e.getID() == MouseEvent.MOUSE_PRESSED)
		{
			calc.keydown(row, col);
		}
		if (e.getID() == MouseEvent.MOUSE_RELEASED)
		{
			calc.keyup(row, col);
		}
	}
}
