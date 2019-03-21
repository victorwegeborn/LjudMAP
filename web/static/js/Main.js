
console.log(subData ? 'sub included' : 'no sub');

$(document).ready(function() {

    var map = $('#map');
    var subMap = $('#subMap')

    /* subdivision layer globals */
    var sync_views = false;
    var is_sublayer_active = false;

    /* key globals */
    var shift_down = false;
    var ctrl_down = false;

    /* Scale slider defaults */
    const min_scale = 1;
    const max_scale = 6;
    const scale_step = 0.01;

    var labeled = false;

    //////////////////////////// INITIALIZING ////////////////////////////

    var plots = [new Plot({
        id: 'default',
        data: data.data,
        meta: data.meta,
        canvas: 'map',
        tooltip: '#tooltip',
        colorSegment: colorSegmentByIndex,
    })];

    /* initialize subplots if available */
    if (subData)
        plots.push(new Plot({
            id: 'sub',
            data: subData.data,
            meta: subData.meta,
            canvas: 'subMap',
            tooltip: '#subTooltip',
            colorSegment: colorSubSegmentsByIndex
        }));


    initSequence()


    // enable switch between 2D and 3D clustering
    if ('2D' in data.data[0]) {
        $('#btn-2D').attr('disabled', false)
    } else {
        $('#btn-2D').attr('disabled', true)
    }

    // disable sublayer button if no sublayer
    if (subData) {
        $('#activateSublayer').on('click', toggleSubCanvas)
    } else {
        $('#activateSublayer').prop('disabled', true)
    }

    // Populate meta info
    $('#metaDefault small').each(function() {
        if ($(this).hasClass('fileName')) {
            $(this).text(audioPath.split("/").slice(-1))
        }
        else if ($(this).hasClass('duration')) {
            $(this).text(msToTime(audioDuration))
        }
        else if ($(this).hasClass('segmentSize')) {
            $(this).text(data.meta.segment_size + ' ms')
        }
        else if ($(this).hasClass('segmentStep')) {
            $(this).text(data.meta.step_size + ' ms')
        }
        else if ($(this).hasClass('dataPoints')) {
            $(this).text(data.data.length)
        }
    })

    // populate meta subdata
    if (subData) {
        $('#metaSub small').each(function() {
            if ($(this).hasClass('segmentSize')) {
                $(this).text(subData.meta.segment_size + ' ms')
            }
            else if ($(this).hasClass('segmentStep')) {
                $(this).text(subData.meta.step_size + ' ms')
            }
            else if ($(this).hasClass('dataPoints')) {
                $(this).text(subData.data.length)
            }
        })
    }

    //////////////////////////// BUTTON EVENTS ////////////////////////////


    function toggleSubCanvas() {
        if (!is_sublayer_active) {
            is_sublayer_active = true;
            $('#activateSublayer').text('Hide subdivision')
            $(subMap).prop('hidden', false)
            $('#subMapFooter').prop('hidden', false)
        } else {
            is_sublayer_active = false;
            $('#activateSublayer').text('Show subdivision')
            $(subMap).prop('hidden', true)
            $('#subMapFooter').prop('hidden', true)
        }
    }


    // Meta data info text toggle setup
    var metaInfo = $('.metaInfo')
    var metaIsHidden = false;
    $('#toggleMeta').on('click', function() {
        if (metaIsHidden) {
            $(metaInfo).each(function() {
                $(this).prop('hidden', false)
            })
            metaIsHidden = false
        } else {
            $(metaInfo).each(function() {
                $(this).prop('hidden', true)
            })
            metaIsHidden = true
        }
    })


    // Button category selection
    $("#buttonGroup1 button").on("click", function() {
        $.each(plots, function() {
            this.changeCategory(this.value)
        });
    });


    // Change algorithm
    $("#buttonGroup2 button").on("click", function() {
        if (this.value === '2D') {
            $.each(plots, function() {
                this.changeDimensions('2D');
            });

            $('#btn-3D').removeClass('active')
            $('#btn-2D').addClass('active')
        }
        else if(this.value === '3D') {
            $.each(plots, function() {
                this.changeDimensions('3D');
            });

            $('#btn-2D').removeClass('active')
            $('#btn-3D').addClass('active')
        }
        else {
        var algo = this.value;
            $.each(plots, function() {
                this.changeAlgorithm(algo)
            });
        }
    });


    // retrain buttons
    $("#buttonGroup5 button").on("click", function() { retrain(this.value) });


    // re-initialize camera on click
    $(".cameraFocus").on("click", function() {
        if ($(this).val() == 'default') {
            plots[0].focusCamera(-1);
        } else {
            plots[1].focusCamera(-1);
        }
    })


    // Axes flattening buttons
    $("#buttonGroupNav button").on("click", function() {
        const axis = this.value;
        const plt = $(this).hasClass('default') ? 0 : 1;
        if (plots[plt].getFlatState(axis) === 1) {
            $(this).addClass('active');
            plots[plt].setFlatState(axis, 0)
            plots[plt].focusCamera(axis);
        } else {
            $(this).removeClass('active');
            plots[plt].setFlatState(axis, 1)
            plots[plt].focusCamera(-1);
        }
    });


    // Sequential play, pause (todo), and stop
    $("#buttonGroup6 button").on("click", function() {
        if (audioLoaded) {
            if(this.value=="stop"){
                stopSequential(reset)
                setSequencePlayheadAt(0)
            }
            else if (this.value=="play" && !PLAYING_AUDIO) {
                playSequential(draw, drawSub)
            }
        }
    });


    function draw() {
        sequentialPlaybackIndex++;
        setSequencePlayheadAt(sequentialPlaybackIndex)
        redrawCanvas()
    }


    function drawSub() {
        subSequentialPlaybackIndex++;
        redrawCanvas()
    }


    function reset() {
        sequentialPlaybackIndex = -1;
        subSequentialPlaybackIndex = -1;
        setSequencePlayheadAt(0)
        redrawCanvas()
    }


    //////////////////////////// SCALE SLIDERS ////////////////////////////


    var scaleSlider = $('#scaleSlider');
    var subScaleSlider = $('#subScaleSlider');

    $(scaleSlider).attr({
        'min': min_scale,
        'max': max_scale,
        'step': scale_step
    });

    $(subScaleSlider).attr({
        'min': min_scale,
        'max': max_scale,
        'step': scale_step
    });

    $(subScaleSlider).on('input', function() {
        plots[1].updateScale($(this).val());
    });

    $(scaleSlider).on('input', function() {
        plots[0].updateScale($(this).val());
    });

    ////////////////////////////////////////////////////////////////////////


    map.on("mousemove", function(ev) {
        if (shift_down) {
            labeled = true;
            plots[0].categorize(plots[1]);
        }
        else if (ctrl_down) {
            updateAudioList();
        }
    })

    subMap.on('mousemove', function(ev) {
        if (shift_down) {
            labeled = true;
            plots[1].categorize(plots[0]);
        }
        else if (ctrl_down) {
            console.log('should playback')
            //updateAudioList();
        }
    })


    //////////////////////////// KEYBOARD ////////////////////////////

    $(document).keydown(function(ev) {
        if (ev.shiftKey) {
            shift_down = true;
        }
        else if (ev.ctrlKey) {
            ctrl_down = true;
        }
    });

    $(document).keyup(function(ev) {
        if (shift_down) {
            shift_down = false;
        }
        else if (ctrl_down) {
            ctrl_down = false;
            currentSegmentStartTimes = [];
        } else {
            var c;
            if (ev.keyCode == 48) {
                c = "black";
            } else if (ev.keyCode == 49) {
                c = "blue";
            } else if (ev.keyCode == 50) {
                c = "green";
            } else if (ev.keyCode == 51) {
                c = "yellow";
            } else if (ev.keyCode == 52) {
                c = "red";
            } else if (ev.keyCode == 53) {
                c = "purple";
            } else if (ev.keyCode == 54) {
                c = "orange";
            } else if (ev.keyCode == 55) {
                c = "teal";
            } else if (ev.keyCode == 56) {
                c = "brown";
            } else {
                return;
            }

            $.each(plots, function() {
                this.changeCategory(c)
            });
        }
    });


    //////////////////////////// RETRAIN ////////////////////////////


    function retrain (arg) {
        if (!labeled) {
            alert("Can't retrain, there are no labels")
        }
        else {
            $("#loadText").show();


            defaultValidPoints = [["id", "startTime(ms)", "label"]]
            subValidPoints = subData ? [["id", "startTime(ms)", "label"]] : null;
            for (let i = 0; i < data.data.length; i++) {
                if (data.data[i].category != 'black') {
                    defaultValidPoints.push([data.data[i].start/data.meta.step_size, data.data[i].start, data.data[i].category])

                    // store subdata relative to default
                    if (subValidPoints) {
                        var idx = data.data[i].start / subData.meta.step_size;
                        for (var j = idx; j < idx + data.meta.segment_size / subData.meta.segment_size; j++) {
                            subValidPoints.push([subData.data[j].start/subData.meta.step_size, subData.data[j].start, subData.data[j].category])
                        }
                    }
                }
            }


            __data = {
                "defaultPoints": JSON.stringify(defaultValidPoints),
                "sessionKey": sessionKey,
                "audioPath": audioPath,
                "defaultSize": data.meta.segment_size,
                "defaultStep": data.meta.step_size,
            }

            if (subData) {
                $.extend(__data, {
                    'subPoints': JSON.stringify(subValidPoints),
                    'subSize': subData.meta.segment_size,
                    'subStep': subData.meta.step_size
                });
            }

            // ensure we compute 2D versions if we have them
            if('2D' in data.data[0]) {
                $.extend(__data, {
                    "2D": ""
                });
            }


            $.ajax({
                type: "POST",
                url: "/retrain",
                data: __data,
                dataType: "json",
                success: function(data, textStatus) {
                    if (data.redirect) {
                        // data.redirect contains the string URL to redirect to
                        window.location.href = data.redirect;
                    }
                    else {
                        console.log("Check ajax request, went to else-statement there");
                    }
                }
            });
        }
    }
})



// Outside document.ready as it is used in html code
function msToTime(ms) {
        // Converts milliseconds to duration, min:sec:ms
        var hours = Math.floor((ms / (60 * 60 * 1000)) % 60).toString();
        var minutes = Math.floor((ms / (60 * 1000)) % 60).toString();
        var seconds = Math.floor((ms / 1000) % 60).toString();
        var milliseconds = (ms % 1000).toString();

        if (hours.length == 1) {
            hours = "0" + hours;
        }
        if (minutes.length == 1) {
            minutes = "0" + minutes;
        }
        if (seconds.length == 1) {
            seconds = "0" + seconds;
        }
        if (milliseconds.length == 1) {
            milliseconds = "00" + milliseconds;
        } else if (milliseconds.length == 2) {
            milliseconds = "0" + milliseconds;
        }
        return hours + ":" + minutes + ":" + seconds + "." + milliseconds;
    }
