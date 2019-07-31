# LjudMAP

An explorative tool for audio material with real-time concatenative sound synthesis capabilities. Adapted from the work by Per Fallgren (https://github.com/perfall/Edyson). 

--------

Install
-----
This application requires the following software to run:
1. [openSMILE](https://www.audeering.com/opensmile/)
2. [BBC's audiowaveform](https://github.com/bbc/audiowaveform)
3. [FFMPEG](http://www.ffmpeg.org/)

Extract and install openSMILE in the repository directory. Ensure relative path to executable:
```
/LjudMAP/opensmile-2.3.0/SMILExtract
```

Install environment
------
Use anaconda or conda to install python dependencies:
```
$ conda env create -f environment.yml
```

activate environment
```
$ source activate LjudMAP
```

run from within LjudMAP/web
```
(LjudMAP) $ python3.6 app.py
```
