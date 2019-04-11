deck.log.enable()
deck.log.priority = 1






class Plot {


    /*
    @param o passes default settings for plot
        data - referense to JSON data object
        canvas - string name of html element to render deck.gl in
        initial_view_state - pass custom initial view state
        point_radius - sets default point radius
        highlight_color - set point highlight color
        algorithm - default cluster algorithm
        dim - default component display
    */
    constructor(o) {
        // ensure method calls inside scope

        if (!o.id) throw 'must assign string id to plot';
        this._id = o.id;

        if (!o.data) throw 'initialize object contains no data';
        this._data = o.data;

        if (!o.canvas) throw 'initialize object contains no string for canvas (id of html element to render in)';
        this._canvas = o.canvas;

        /* set meta */
        if (!o.meta) throw 'pass meta data to plot';
        this._segment_size = o.meta.segment_size;
        this._segment_step = o.meta.step_size;
        this._npoints = this._data.length;

        /* set tooltip element string */
        this._tooltip = o.tooltip;

        /* initialize view state */
        this._initial_view_state = o.initial_view_state || {
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

        this._highlight_color = o.highlight_color || [255, 40, 0, 0];


        /* state tracking */
        this._current_algorithm = 'umap';
        this._current_category = 'black';
        this._current_dim = o.dim || '3D';
        this._flatten = [1, 1, 1];
        this._current_view_state = this._initial_view_state;
        this._point_radius = o.point_radius || 40;
        this._scale = 1;
        this._local_mouse = { x: 0, y: 0 };
        this._picking_radius = o.picking_radius || 30;


        /* attribute triggers */
        this._color_trigger = 0;
        this._highlight_index = -1;

        /* setup callbacks */
        this._colorSegmentByIndex = o.colorSegment


        /* INITIALIZE DECK GL */
        this.renderer = new deck.DeckGL({
            container: this._canvas,
            mapbox: false,
            fp64: true,
            views: [
                new deck.OrbitView({ controller: true })
            ],
            viewState: this._initial_view_state,
            onViewStateChange: ({viewState}) => {
                //console.log(viewState)
                this._current_view_state = viewState;
                this.renderer.setProps({viewState: this._current_view_state});
            },
            layers: [
                new deck.PointCloudLayer({
                    id: this._id,
                    data: this._data,
                    coordinateSystem: COORDINATE_SYSTEM.IDENTITY,
                    getPosition: d => [0,0,0],
                    getColor: d => this._getColor(d.category),
                    getNormal: d => d.normal,
                    radiusPixels: this._point_radius,
                    lightSettings: {},
                    transitions: {
                        getPosition: {
                            duration: 1600,
                            easing: d3.easeExpOut,
                        }
                    },
                })
            ],
            pickingRadius: this._picking_radius,
            getCursor: () => 'crosshair',
            onLoad: () => {
                this._redraw()
            }
        })
    }



    /* rerender canvas. call on state change */
    _redraw() {
        const pointCloudLayer = new deck.PointCloudLayer({
            id: this._id,
            data: this._data,
            coordinateSystem: COORDINATE_SYSTEM.IDENTITY,
            getPosition: d => {
                let _pos = d[this._current_dim][this._current_algorithm];

                /* handle flattning of axis */
                return [_pos[0]*this._flatten[0]*this._scale,
                        _pos[1]*this._flatten[1]*this._scale,
                        _pos[2]*this._flatten[2]*this._scale];
            },
            getColor: d => {
                if (this._colorSegmentByIndex)
                    this._colorSegmentByIndex(d.id)
                return this._getColor(d.category)
            },
            getNormal: d => d.normal,
            radiusPixels: this._point_radius,
            lightSettings: {},
            highlightedObjectIndex: this._highlight_index,
            highlightColor: this._highlight_color,
            updateTriggers: {
                getColor: [this._color_trigger,
                           this._highlight_index],
                getPosition: [this._current_algorithm,
                              this._flatten[0],
                              this._flatten[1],
                              this._flatten[2],
                              this._scale,
                              this._current_dim],
            },
            transitions: {
                getPosition: {
                    duration: 1600,
                    easing: d3.easeExpOut,
                }
            },
            pickable: true,
            onHover: info => {
                 this._local_mouse.x = info.x,
                 this._local_mouse.y = info.y;
                 showToolTip(info.object, info.index, this._tooltip)
             }
        });

        /* update deck.gl canvas with new pointcloud */
        this.renderer.setProps({
            layers: [pointCloudLayer]
        });

        /* reset trigger for color change */
        if (this._color_trigger >= Number.MAX_SAFE_INTEGER - 10) {
            this._color_trigger=0;
        }
    }


    getFlatState(axis) {
        return this._flatten[axis];
    }

    setFlatState(axis, val) {
        this._flatten[axis] = val;
    }

    focusCamera(axis) {
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

        this._current_view_state = Object.assign({}, this._current_view_state, {
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
        this.renderer.setProps({viewState: this._current_view_state})
        this._redraw()
    }

    /*
        Color points based on mouse input
        @param is the other plot
    */
    categorize(other) {
        // if ratio > 1 => other is sub
        // if ratio < 1 => other is larger
        // if ratio == null => no other plot exists
        var ratio = null;
        if (other) ratio = this._segment_size / other._segment_size;


        // pick points in this plot
        var pickedPoints = this.renderer.pickMultipleObjects({
            x: this._local_mouse.x,
            y: this._local_mouse.y,
            radius: 20,
            depth: 40,
        })


        if (pickedPoints.length > 1) {
            for (let i = 0; i < pickedPoints.length; i++) {
                pickedPoints[i].object.category = this._current_category;
                var id = pickedPoints[i].object.id;


                if (ratio) {
                    // other is sub, update accordingly
                    if (ratio > 1) {
                        var index = id * ratio;
                        for (var j = index; j < index + ratio; j++) {
                            other._data[j].category = this._current_category;
                        }
                    }

                    // other is default, update accordingly
                    // TODO: blend colors
                    if (ratio < 1) {
                        other._data[Math.floor(id * ratio)].category = this._current_category;
                    }
                }
            }

            /* re-render canvas after update */
            this.updateColors()
            if (other) {
                other.updateColors()
            }
        }
    }


    updateAudioList(o) {
        var pointsInRadius = this.renderer.pickMultipleObjects({
            x: this._local_mouse.x, y: this._local_mouse.y,
            radius: 10,
            depth: 5,
        });

        var m = pointsInRadius.length, t, i;
        while (m) {
            // Pick a remaining element…
            i = Math.floor(Math.random() * m--);
            // And swap it with the current element.
            t = pointsInRadius[m];
            pointsInRadius[m] = pointsInRadius[i];
            pointsInRadius[i] = t;
        }

        for (var i = 0; i < pointsInRadius.length; i++) {
            o.hooverPlay(pointsInRadius[i].object.id, pointsInRadius[i].object.start, this._segment_size)
        }
    }


    /* Setters */
    updateColors() {
        this._color_trigger++;
        this._redraw()
    }

    changeAlgorithm(a) {
        if (this._current_category === a) return;
        this._current_algorithm = a;
        this._redraw()
    }
    changeCategory(c) {
        if (this._current_category === c) return;
        this._current_category = c;
    }

    getCategory() {
        return this._current_category;
    }

    changeDimensions(d) {
        if (this._current_dim === d) return;
        this._current_dim = d;
        this._redraw()
    }

    updateScale(s) {
        this._scale = s;
        this._redraw()
    }

    incrementHighlight() {
        this._highlight_index++;
        this._redraw()
        return this._highlight_index;
    }

    setHighlight(i) {
        this._highlight_index = i;
        this._redraw()
    }

    resetHighlight() {
        this._highlight_index = -1;
        this._redraw()
    }



    _getColor(c) {
        var alpha = this._highlight_index > 0 ? 35 : 240;
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

}



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
