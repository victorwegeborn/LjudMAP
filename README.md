# LjudMAP

Install
-----
This application requires two external softwares in order to run.
Get them here:
1. [openSMILE](https://www.audeering.com/opensmile/) 
2. [BBC's audiowaveform](https://github.com/bbc/audiowaveform)
3. [FFMPEG](http://www.ffmpeg.org/) - only needed for .mp3-files

Extract and install openSMILE in the repository directory. Ensure relative path to executable:
```
/Temporally-Disassembled-Audio/opensmile-2.3.0/SMILExtract
```

Install environment
------
Use anaconda or conda to install python dependencies:
```
$ conda env create -f environment.yml
```

activate environment
```
$ source activate TDA
```

run from within /web
```
(TDA) $ python3.6 app.py
```
