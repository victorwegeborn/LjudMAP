///////////////
// Web audio //
///////////////


var audioCtx = new AudioContext();
var audioBuffer;
var audioLoaded = false;
var currentSegmentStartTimes = [];
var PLAYING_AUDIO = false;
var sequentialPlaybackIndex = -1;
var subSequentialPlaybackIndex = -1;
loadAudio(audioPath);

var launchInterval = data.meta.segment_size/2;
$("#launchSlider").val(launchInterval);
$("#launchSliderText").text("Launch interval: " + launchInterval);

var fade = data.meta.segment_size/2;
$("#fadeSlider").val(fade);
$("#fadeSliderText").text("Fade in/out: " + fade);

var gradient = 50;
$("#gradientSlider").val(gradient);
$("#gradientSliderText").text("Gradient: " + gradient);

$("#launchSlider").on("mousemove", function() {
    launchInterval = this.value;
    $("#launchSliderText").text("Launch interval: " + launchInterval);
})

$("#fadeSlider").on("mousemove", function() {
    fade = this.value;
    $("#fadeSliderText").text("Fade in/out: " + fade);
})

$("#gradientSlider").on("mousemove", function() {
    gradient = this.value;
    $("#gradientSliderText").text("Gradient: " + gradient);
})

function loadAudio(fileName) {
    audioList = [fileName];
    bufferLoader = new BufferLoader(
        audioCtx,
        audioList,
        finishedLoading
    );
    bufferLoader.load();

    function finishedLoading(bufferList) {
        audioBuffer = bufferList[0];
        audioLoaded = true;
        $("#loading-sm").hide()
        console.log("Audio loaded.");
    }
}



var clock;
var sequencialSource;
var highlightPointEvent;
var subHighlightPointEvent;
function playSequential(plots) {
    PLAYING_AUDIO = true;
    clock = new WAAClock(audioCtx, {toleranceEarly: 0.1});
    clock.start()

    var volume = audioCtx.createGain();
    volume.connect(audioCtx.destination);
    sequencialSource = audioCtx.createBufferSource();
    sequencialSource.buffer = audioBuffer;
    sequencialSource.connect(volume);
    sequencialSource.start(0)

    highlightPointEvent = clock.callbackAtTime(() => {
        var index = plots[0].incrementHighlight()
        setSequencePlayheadAt(index)
    }, data.meta.step_size/1000)
    .repeat(data.meta.step_size/1000)
    .tolerance({late: 0.1})

    if (subData) {
        subHighlightPointEvent = clock.callbackAtTime(() => {
            var index = plots[1].incrementHighlight()
            setSequencePlayheadAt(index)
        }, subData.meta.step_size/1000)
        .repeat(subData.meta.step_size/1000)
        .tolerance({late: 0.1})
    }
}


function stopSequential(plots) {
    if (PLAYING_AUDIO) {
        PLAYING_AUDIO = false;
        highlightPointEvent.clear()
        clock.stop()
        sequencialSource.stop()
        plots[0].resetHighlight()
        if (subData) {
            subHighlightPointEvent.clear()
            plots[1].resetHighlight()
        }

    }
}

var a_highlight_play_tracker = 0;
function playSegment(start, reset) {
    a_highlight_play_tracker++;
    var source = audioCtx.createBufferSource();
    var volume = audioCtx.createGain();
    source.buffer = audioBuffer;
    source.connect(volume);
    volume.connect(audioCtx.destination);
    source.start(audioCtx.currentTime, start/1000, data.meta.segment_size/1000);
    source.onended = function(e) {
        a_highlight_play_tracker--;
        if (a_highlight_play_tracker <= 1) {
            reset(0) // resets sequencemap playhead
        }
    }
}


// This function is called every 1000ms and samples and plays audio segments from
// currentSegmentStartTimes according to launch-intervals and fade
function playSegments(){
    if(currentSegmentStartTimes.length > 0) {
        var i;
        var startTime
        //console.log(launchInterval);
        for (i = 0; i < 100; i++) {
            startTime = audioCtx.currentTime + (i*launchInterval)/1000;
            var audioInterval = currentSegmentStartTimes[Math.floor(Math.random()*currentSegmentStartTimes.length)].object.start;
            var source = audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            var volume = audioCtx.createGain();
            source.connect(volume);
            volume.connect(audioCtx.destination);

            volume.gain.value = 0.1;
            volume.gain.exponentialRampToValueAtTime(1.0, startTime + fade/1000);
            volume.gain.setValueAtTime(1.0, startTime + (data.meta.segment_size-fade)/1000);
            volume.gain.exponentialRampToValueAtTime(0.1, startTime + data.meta.segment_size/1000);

            if (i*launchInterval >= 1000) {
                break;
            }
            source.start(startTime, audioInterval/1000, data.meta.segment_size/1000);
            //console.log(audioInterval + " starting in: " + startTime);
        }
    }
}


setInterval(playSegments, 1000);
//setInterval(updateTimeBar, 100);
