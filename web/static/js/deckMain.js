

$(document).ready(function() {

    // initialize sequence map
    initSequence()
    deck.log.enable()
    deck.log.priority = 1


    /* constants */
    const HIGHLIGHT_COLOR = [255, 40, 0, 0];
    const INITIAL_VIEW_STATE = {
        lookAt: [0,0,0,1],
        fov: 50,
        distance: 20,
        rotationX: 0,
        rotationOrbit: 0,
        zoom: 0.04,
        offset: [0,0,0],
        translationX: 0,
        translationY: 0,
    };

    /* renderer canvas */
    var map = $('#map');
    var subMap = $('#subMap')

    /* rendering for all layers globals */
    var _current_algorithm = 'default';
    var _current_category = 'black';
    var _current_dim = '3D'

    /* default layer globals */
    var _flatten = [1, 1, 1];
    var _current_view_state = INITIAL_VIEW_STATE;
    var _point_radius = 40;
    var _labeled = false;
    var _scale = 1;

    /* subdivision layer globals */
    var _sync_views = false;
    var _sub_exists = false;
    var _is_sublayer_active = false;
    var _is_sublayer_initialized = false;
    var _sub_current_view_state = INITIAL_VIEW_STATE;
    var _sub_scale = 1;

    /* local mouse position on plot (Updated with callbacks) */
    var _local_mouse = { x: 0, y: 0 };

    /* key globals */
    var _shift_down = false;
    var _ctrl_down = false;

    /* Scale slider defaults */
    const _min_scale = 1;
    const _max_scale = 6;
    const _scale_step = 0.01;

    var _subs_per_default;


    function getColor(c) {
        var alpha = PLAYING_AUDIO ? 50 : 240;
        switch (c) {
            case 'black' : return [ 51,  58,  63, alpha]; break;
            case 'blue'  : return [  0, 125, 255, alpha]; break;
            case 'green' : return [  0, 167,  84, alpha]; break;
            case 'yellow': return [255, 191,  66, alpha]; break;
            case 'red'   : return [228,  47,  70, alpha]; break;
            case 'purple': return [134,   0, 123, alpha]; break;
            case 'orange': return [255, 163,  56, alpha]; break;
            case 'teal'  : return [  0, 129, 128, alpha]; break;
            case 'brown' : return [171,  38,  44, alpha]; break;
                default:
                    console.log('Point without valid category');
                    return [255,255,255,255];
        }
    }



    /* DECK GL RENDERER */
    const deckgl = new deck.DeckGL({
        container: 'map',
        mapbox: false,
        fp64: true,
        views: [
            new deck.OrbitView({ controller: true })
        ],
        viewState: INITIAL_VIEW_STATE,
        onViewStateChange: ({viewState}) => {
            //console.log(viewState)
            _current_view_state = viewState;
            deckgl.setProps({viewState: _current_view_state});
        },
        layers: [
            new deck.PointCloudLayer({
                id: 'default',
                data: data.data,
                coordinateSystem: COORDINATE_SYSTEM.IDENTITY,
                getPosition: d => [0,0,0],
                getColor: d => getColor(d.category),
                getNormal: d => d.normal,
                radiusPixels: _point_radius,
                lightSettings: {},
                transitions: {
                    getPosition: {
                        duration: 1600,
                        easing: d3.easeExpOut,
                    }
                },
            })
        ],
        pickingRadius: 30,
        getCursor: () => 'crosshair',
        onLoad: () => {
            changeAlgorithm('tsne')
            redrawCanvas()
        }
    })


    /* SUB LAYER DECK GL RENDERER */
    /* Not initialized until show layer is pressed */
    var subDeckgl;
    function initializeSub() {
        if (!_is_sublayer_initialized) {
            _is_sublayer_initialized = true;
            subDeckgl = new deck.DeckGL({
                container: 'subMap',
                mapbox: false,
                fp64: true,
                views: [
                    new deck.OrbitView({ controller: true })
                ],
                viewState: _current_view_state,
                onViewStateChange: ({viewState}) => {
                    //console.log(viewState)
                    _current_view_state = viewState;
                    subDeckgl.setProps({viewState: _current_view_state});
                },
                layers: [
                    new deck.PointCloudLayer({
                        id: 'sub',
                        data: subData.data,
                        coordinateSystem: COORDINATE_SYSTEM.IDENTITY,
                        getPosition: d => [0,0,0],
                        getColor: d => getColor(d.category),
                        getNormal: d => d.normal,
                        radiusPixels: _point_radius,
                        lightSettings: {},
                        transitions: {
                            getPosition: {
                                duration: 1600,
                                easing: d3.easeExpOut,
                            }
                        },
                    })
                ],
                pickingRadius: 30,
                getCursor: () => 'crosshair',
                onLoad: () => {
                    changeAlgorithm(_current_algorithm)
                    redrawCanvas()
                }
            })
        }
    }

    /* Orients camera to look at plane
            -1 = origin
             0 = x axis flatten
             1 = y axis flatten
             2 = z axis flatten
    */
    function focusCamera(axis) {
        // XY plane
        var rotX = 0;
        var rotOrb = 0;

        // x flattened
        if (axis != -1) {
            if (axis == 0) {
                rotX = 90;
                rotOrb = -90;
            }
            else if (axis == 1) {
                rotX = 90;
            }
            else if (axis == 2) {
            }
        }

        currentViewState = Object.assign({}, _current_view_state, {
            translationX: 0,
            translationY: 0,
            lookAt: [0,0,0,1], // why the fourth component? Paning stops working without...
            distance: 20,
            rotationX: rotX,
            rotationOrbit: rotOrb,
            transitionDuration: 1000,
            transitionEasing: d3.easeExpOut,
            transitionInterpolator: new deck.LinearInterpolator(['translationX',
                                                                 'translationY',
                                                                 'distance',
                                                                 'rotationX',
                                                                 'rotationOrbit',
                                                                 'lookAt'])
        });
        console.log(currentViewState)
        deckgl.setProps({viewState: currentViewState})
    }



    /* Canvas layer creation */
    var colorTrigger = 0;
    function redrawCanvas() {
        // reset color trigger
        if (colorTrigger > Number.MAX_SAFE_INTEGER - 1) { colorTrigger = 0; }
        const pointCloudLayer = new deck.PointCloudLayer({
            id: 'default',
            data: data.data,
            coordinateSystem: COORDINATE_SYSTEM.IDENTITY,
            getPosition: d => {
                let _pos = d[_current_dim][_current_algorithm];

                /* handle flattning of axis */
                return [_pos[0]*_flatten[0]*_scale, _pos[1]*_flatten[1]*_scale, _pos[2]*_flatten[2]*_scale];
            },
            getColor: d => {
                colorSegmentByIndex(d.id, true)
                return getColor(d.category)
            },
            getNormal: d => d.normal,
            radiusPixels: _point_radius,
            lightSettings: {},
            highlightedObjectIndex: sequentialPlaybackIndex,
            highlightColor: HIGHLIGHT_COLOR,
            updateTriggers: {
                getColor: [colorTrigger, PLAYING_AUDIO],
                getPosition: [_current_algorithm, _flatten[0], _flatten[1], _flatten[2], _scale, _current_dim],
            },
            transitions: {
                getPosition: {
                    duration: 1600,
                    easing: d3.easeExpOut,
                }
            },
            pickable: true,
            onHover: info => {
                 _local_mouse.x = info.x,
                 _local_mouse.y = info.y;
                 showToolTip(info.object, info.index, '#tooltip')
             }
            //onHover: info => hoverInteraction(info)
        });

        var subCloudLayer = new deck.PointCloudLayer({
            id: 'sub',
            data: subData.data,
            visible: _is_sublayer_active,
            coordinateSystem: COORDINATE_SYSTEM.IDENTITY,
            getPosition: d => {
                let _pos = d[_current_dim][_current_algorithm];
                /* handle flattning of axis */
                return [_pos[0]*_flatten[0]*_sub_scale, _pos[1]*_flatten[1]*_sub_scale, _pos[2]*_flatten[2]*_sub_scale];
            },
            getColor: d => {
                colorSegmentByIndex(d.id, false)
                return getColor(d.category);
            },
            getNormal: d => d.normal,
            radiusPixels: _point_radius,
            lightSettings: {},
            highlightedObjectIndex: subSequentialPlaybackIndex,
            highlightColor: HIGHLIGHT_COLOR,
                updateTriggers: {
                getColor: [colorTrigger, PLAYING_AUDIO],
                getPosition: [_current_algorithm, _flatten[0], _flatten[1], _flatten[2], _sub_scale, _current_dim],
            },
            transitions: {
                getPosition: {
                    duration: 1600,
                    easing: d3.easeExpOut,
                }
            },
            pickable: true,
            onHover: info => {
                     _local_mouse.x = info.x,
                     _local_mouse.y = info.y;
                     showToolTip(info.object, info.index, '#subTooltip')
             }
            //onHover: info => hoverInteraction(info)
        });


        if (_is_sublayer_active) {
            subDeckgl.setProps({
                layers: [subCloudLayer]
            });
        }

        deckgl.setProps({
            layers: [pointCloudLayer]
        });

    }



    function toggleSubCanvas() {
        if (!_is_sublayer_active) {
            _is_sublayer_active = true;
            $('#activateSublayer').text('Hide subdivision')
            $(subMap).prop('hidden', false)
            $('#subMapFooter').prop('hidden', false)
            initializeSub();
        } else {
            _is_sublayer_active = false;
            $('#activateSublayer').text('Show subdivision')
            $(subMap).prop('hidden', true)
            $('#subMapFooter').prop('hidden', true)
            redrawCanvas()
        }
    }

    function changeAlgorithm(algo) {
        _current_algorithm = algo;
    }

    function categorize(o) {
        var isDefault = o.props.layers[0].id === 'default' ? true : false;

        // local mouse updated in both sub and default canvas
        var pickedPoints = o.pickMultipleObjects({
            x: _local_mouse.x,
            y: _local_mouse.y,
            radius: 20,
            depth: 40,
        })

        // TODO: optimize this
        if (pickedPoints.length > 1) {
            for (let i = 0; i < pickedPoints.length; i++) {
                var previousCategory = pickedPoints[i].object.category;
                pickedPoints[i].object.category = _current_category;
                var id = pickedPoints[i].object.id;

                // sequence updates
                if (previousCategory !== _current_category) {
                    if (_sub_exists) {
                        var subPerDefault = data.meta.segment_size / subData.meta.segment_size;
                        if (isDefault) {
                            subData.data[id*subPerDefault].category = _current_category
                            subData.data[id*subPerDefault+1].category = _current_category
                        } else {
                            data.data[Math.floor(id / subPerDefault)].category = _current_category
                        }
                    }
                }
            }

            // update deck.gl's and sequenceMap's
            colorTrigger++;
            redrawCanvas()
            _labeled = true;
        }
    }


    function updateAudioList() {
        if (audioLoaded) {
            pointsInRadius = deckgl.pickMultipleObjects({
                x: _local_mouse.x, y: _local_mouse.y,
                radius: 20,
                depth: 200,
            });
            if (pointsInRadius.length > 0) {
                startList = [];
                for (let i = 0; i < pointsInRadius.length; i++) {
                    startList.push(pointsInRadius[i].object.start);
                }
                currentSegmentStartTimes = startList;
            }
        }
    }



    //////////////////////////// BUTTON EVENTS ////////////////////////////

    // enable switch between 2D and 3D clustering
    if ('2D' in data.data[0]) {
        $('#btn-2D').attr('disabled', false)
    } else {
        $('#btn-2D').attr('disabled', true)
    }

    // disable sublayer button if no sublayer
    if (subData === false) {
        $('#activateSublayer').prop('disabled', true)
    } else {
        // set up event
        _sub_exists = true;
        _subs_per_default = data.meta.segment_size / subData.meta.segment_size  ;
        console.log('segments -> sub/default:', _subs_per_default)
        $('#activateSublayer').on('click', toggleSubCanvas)
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
    if (subData !== false) {
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

    // Button cattegory selection
    $("#buttonGroup1 button").on("click", function() {
        if (_current_category !== this.value) {
            _current_category = this.value;
            console.log('new category', _current_category)
        }
    });

    // Change algorithm
    $("#buttonGroup2 button").on("click", function() {
        if (this.value === '2D') {
            _current_dim = '2D';
            $('#btn-3D').removeClass('active')
            $('#btn-2D').addClass('active')
        }
        else if(this.value === '3D') {
            _current_dim = '3D';
            $('#btn-2D').removeClass('active')
            $('#btn-3D').addClass('active')
        }
        else if (_current_algorithm !== this.value) {
            changeAlgorithm(this.value)
        }
        redrawCanvas()
    });

    // retrain buttons
    $("#buttonGroup5 button").on("click", function() { retrain(this.value) });

    // re-initialize camera on click
    $("#cameraFocus").on("click", () => { focusCamera(-1) })

    // Axes flattening buttons
    $("#buttonGroupNav button").on("click", function() {
        const axis = this.value;
        if (_flatten[axis] === 1) {
            _flatten[axis] = 0;
            $(this).addClass('active');
            focusCamera(axis)
        } else {
            _flatten[axis] = 1;
            $(this).removeClass('active');
            focusCamera(-1)
        }
        redrawCanvas();
    });


    // Sequential play, pause (todo), and stop
    $("#buttonGroup6 button").on("click", function() {
        if (audioLoaded) {
            if(this.value=="stop"){
                stopSequential()
                setSequencePlayheadAt(0)
            }
            else if (this.value=="play" && !PLAYING_AUDIO) {
                playSequential()
            }
        }
    });


    //////////////////////////// SCALE SLIDERS ////////////////////////////

    var scaleSlider = $('#scaleSlider');
    var subScaleSlider = $('#subScaleSlider');

    $(scaleSlider).attr({
        'min': _min_scale,
        'max': _max_scale,
        'step': _scale_step
    });

    $(subScaleSlider).attr({
        'min': _min_scale,
        'max': _max_scale,
        'step': _scale_step
    });

    $(subScaleSlider).on('input', function() {
        _sub_scale = $(this).val();
        redrawCanvas()
    });

    $(scaleSlider).on('input', function() {
        _scale = $(this).val();
        redrawCanvas()
    });

    ////////////////////////////////////////////////////////////////////////


    map.on("mousemove", function(ev) {
        if (_shift_down) {
            categorize(deckgl);
        }
        else if (_ctrl_down) {
            updateAudioList();
        }
    })

    subMap.on('mousemove', function(ev) {
        if (_shift_down) {
            categorize(subDeckgl);
        }
        else if (_ctrl_down) {
            console.log('should playback')
            //updateAudioList();
        }
    })


    ////////////////
    // Key events //
    ////////////////

    $(document).keydown(function(ev) {
        if (ev.shiftKey) {
            _shift_down = true;
        }
        else if (ev.ctrlKey) {
            _ctrl_down = true;
        }
    });

    $(document).keyup(function(ev) {
        if (_shift_down) {
            _shift_down = false;
        }
        else if (_ctrl_down) {
            _ctrl_down = false;
            currentSegmentStartTimes = [];
        } else {
            if (ev.keyCode == 48) {
                _current_category = "black";
            } else if (ev.keyCode == 49) {
                _current_category = "blue";
            } else if (ev.keyCode == 50) {
                _current_category = "green";
            } else if (ev.keyCode == 51) {
                _current_category = "yellow";
            } else if (ev.keyCode == 52) {
                _current_category = "red";
            } else if (ev.keyCode == 53) {
                _current_category = "purple";
            } else if (ev.keyCode == 54) {
                _current_category = "orange";
            } else if (ev.keyCode == 55) {
                _current_category = "teal";
            } else if (ev.keyCode == 56) {
                _current_category = "brown";
            }
            else if (ev.keyCode == 81) {
                floatingCircleRadius = 50;
                prevFloatingCircleRadius = 50;
                // var circle = map.selectAll("circle");
                // circle.style('stroke-width', floatingCircleRadius);
            }
            else if (ev.keyCode == 87) {
                floatingCircleRadius = 100;
                prevFloatingCircleRadius = 100;
                // var circle = map.selectAll("circle");
                // circle.style('stroke-width', floatingCircleRadius);
            }
            else if (ev.keyCode == 69) {
                floatingCircleRadius = 150;
                prevFloatingCircleRadius = 150;
                // var circle = map.selectAll("circle");
                // circle.style('stroke-width', floatingCircleRadius);
            } else if (ev.keyCode == 82) {
                floatingCircleRadius = 300;
                prevFloatingCircleRadius = 300;
                // var circle = map.selectAll("circle");
                // circle.style('stroke-width', floatingCircleRadius);
            }
        }
    });



    /////////////
    // RETRAIN //
    ////////////


    function retrain (arg) {
        if (!_labeled) {
            alert("Can't retrain, there are no labels")
        }
        else {
            $("#loadText").show();


            defaultValidPoints = [["id", "startTime(ms)", "label"]]
            subValidPoints = _sub_exists ? [["id", "startTime(ms)", "label"]] : null;
            for (let i = 0; i < data.data.length; i++) {
                if (data.data[i].category != 'black') {
                    defaultValidPoints.push([data.data[i].start/data.meta.step_size, data.data[i].start, data.data[i].category])

                    // store subdata relative to default
                    if (subValidPoints) {
                        var idx = data.data[i].start / subData.meta.step_size;
                        for (var j = idx; j < idx + _subs_per_default; j++) {
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

            if (_sub_exists) {
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
    function playSequential() {
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
            sequentialPlaybackIndex++
            setSequencePlayheadAt(sequentialPlaybackIndex)
            redrawCanvas()
        }, data.meta.step_size/1000)
        .repeat(data.meta.step_size/1000)
        .tolerance({late: 0.1})

        if (_sub_exists) {
            subHighlightPointEvent = clock.callbackAtTime(() => {
                subSequentialPlaybackIndex++
                redrawCanvas()
            }, subData.meta.step_size/1000)
            .repeat(subData.meta.step_size/1000)
            .tolerance({late: 0.1})
        }
    }

    function stopSequential() {
        if (PLAYING_AUDIO) {
            PLAYING_AUDIO = false;
            highlightPointEvent.clear()
            clock.stop()
            sequencialSource.stop()
            sequentialPlaybackIndex = -1;
            if (_sub_exists) {
                subHighlightPointEvent.clear()
                subSequentialPlaybackIndex = -1;
            }
            redrawCanvas()
        }
    }


    // This function is called every 1000ms and samples and plays audio segments from
    // currentSegmentStartTimes according to launch-intervals and fade
    function playSegments(){
        if(currentSegmentStartTimes.length > 0) {
            var i;
            var startTime
            console.log(launchInterval);
            for (i = 0; i < 100; i++) {
                startTime = audioCtx.currentTime + (i*launchInterval)/1000;
                var audioInterval = currentSegmentStartTimes[Math.floor(Math.random()*currentSegmentStartTimes.length)];
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
                console.log(audioInterval + " starting in: " + startTime);
            }
        }
    }


    setInterval(playSegments, 1000);
    //setInterval(updateTimeBar, 100);
})

function showToolTip(object, index, target) {
    const el = $(target);
    if (object) {
        el.html('index: ' + index + '<br>time: ' + msToTime(object.start));
        el.css('display', 'block')
        el.css('height', '30')
    } else {
        el.css('display', 'none')
    }
}

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
