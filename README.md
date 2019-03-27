# Temporally Disassembled Audio (TDA)

Install
------

1. Clone repository
2. Download openSMILE from https://www.audeering.com/opensmile/
3. Extract openSMILE inside repository folder. Ensure relative path to executable:
```
/Temporally-Disassembled-Audio/opensmile-2.3.0/SMILExtract
```
5. Build openSMILE. [Mac workaround](https://stackoverflow.com/questions/42736091/macos-configure-error-c-compiler-cannot-create-executables)
4. Install [BBC's audiowaveform](https://github.com/bbc/audiowaveform):

```
$ brew tap bbc/audiowaveform
$ brew install audiowaveform
```

5. Setup conda environment
```
$ conda env create -f environment.yml
```

6. Run application within web folder
```
$ (TDA) python3.6 app.py
```
