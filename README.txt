JavaScript TI-68k (89, 92+, V200, 89T) graphing calculator emulator
===================================================================

This is an emulator for TI-68k calculators, written in JavaScript.
Such a scheme would have been quite insane several years ago (even though
Fabrice Bellard's JS x86 emulator is already pretty old), but nowadays, it
clearly makes a whole lot of sense:
* in the 2010s, modern JS engines have become able to emulate at acceptable
speed a number of platforms based on old processor ISAs, complete with
accompanying devices, at various degrees of accuracy;
* in 2014, the number of relatively high-powered mobile devices (mainly
ARM-based smartphones and tablets) has become higher than the number of classic
computers, and the gap widens over time;
* HTML5 and browsers act as platform abstraction layers. HTML5 apps have become
a widely used way to build and distribute cross-platform software targeting
mainly Android + iOS on the mobile side, mainly Windows + MacOS X +
Linux/Android on the desktop side, and a bunch of low-share wannabe players.
* the TI-68k developer community belittled a lot in 2006-2007 and never grew
back up, which causes the /non-developer/ user proportion to be even more
overwhelming (with general TI-68k marketshare falling, due to the Nspire, and
other, non-calculator platforms).

This emulator is originally the work of an old-timer of the TI community,
Patrick "PatrickD" Davidson. It was subsequently vastly improved and expanded
by another slightly less old-timer, Lionel Debroux, and used for months at
TI-Planet before _official_ opening to the public (dozens of persons knew that
third parties could take advantage of the exact same code base, the link was
posted publicly in a topic about TIEmu).

See the JS file (currently v12_readable.js) for changelog and todo/wish list,
and the HTML file (currently v12.html) for the canonical usage example / API
documentation.


Usage
-----
Use the example HTML page, and make your own :)
The emulator can import .tib and .89u / .9xu / .v2u images; offline conversion
of OS upgrades images can be done with the v12tibconv.py script.
The integration into HTML code is eased by _optional_ setters for document
element IDs: set_elementid_*() in TI68kEmulatorUIModule.


Goals
-----
* providing a cross-platform, install-less software (though it could be
embedded into something else which requires installation);
* being able to emulate _most_ TI-68k OS and programs, and thereby helping with
continued availability of the TI-68k platform in the years to come. For short,
being a "good enough" emulator;
* being maintained as open source software, with a publicly readable and
modifiable version of the source code (which doesn't preclude upstream from
distributing, alongside the readable version, the result of minification +
optimization of the code);
* providing a reasonable API, and easy integration into HTML pages (going as
far as setters for the IDs of the document elements used by the script). No
need to impose iframes and/or cross-domain communication onto the user.


Non-goals
---------
* being strongly tied to any particular website (even if such an integration
can obviously be built on top of the code);
* providing high emulation accuracy required for developing, say, new program
launchers. Accurate emulation of several hardware aspects would take a severe
toll on emulation performance, without helping users running a larger number
of relevant programs.
Two such hardware aspects are emulation of the various HW2+ execution
protections, and accurate 68000 pipeline emulation:
    * on real calculators, many users use HW3Patch to disable the unwanted
      execution protection anyway;
    * a small subset of developers sometimes needs such accuracy for select
      classes of programs... but the fact is that the TI-68k native code
      developer community belittled a lot in 2006-2007. It was synchronous with
      the advent of the Nspire, but not caused by it in an obvious way, as
      native code became available on the Nspire to the general public only at
      the end of February 2010. In 2014, the fact is that pretty little
      brand-new native code is being written for the TI-68k platform.
    * lack of 68000 pipeline emulation makes the emulator unable to run a
      handful of programs whose sole goal is to kill silly protections and
      artificial restrictions created by TI... but precisely, some of those
      protections are intentionally not implemented by the emulator, as
      described above...
      Anyway, there's tiosmod+amspatch for pre-patching OS images.


Copyright information
---------------------
Copyright (C) 2011-2013 Patrick "PatrickD" Davidson (v1-v11) - http://www.ocf.berkeley.edu/~pad/emu/
Copyright (C) 2012-2014 Lionel Debroux (modified v7-v11, new v12) - http://tict.ticalc.org, http://tiplanet.org
Copyright (C) 2012-2014 Xavier "critor" Andréani
Copyright (C) 2012-2014 Adrien "Adriweb" Bertrand


Greetings
---------
* Patrick Davidson for starting the work;
* Romain Liévin and the contributors to TIEmu;
* Rusty Wagner for VTI;
* Xavier "critor" Andréani for suggestions, bug reports, contributions,
integration into TI-Planet;
* Adrien "Adriweb" Bertrand for suggestions and contributions;
* Christopher "Kerm Martian" Mitchell for the jsTIfied TI-Z80 emulator, and
discussions. jsTIfied has a number of good aspects, and also an aspect which
should be avoided :)
* Martial "Folco" Demolins for suggestions and some PedroM tests.
