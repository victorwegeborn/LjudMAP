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
        this._segment_size = o.meta.settings.segmentation.size;
        this._segment_step = o.meta.settings.segmentation.step;
        this._npoints = this._data.length;

        this._history = o.history;

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
        this._current_category = 0;
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
                    getColor: d => COLORS.get(d.category, 1, d.song_id),
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
                if (space_down)
                    this._colorSegmentByIndex(d.id)
                var a = this._highlight_index > 0 ? 20 : null;
                return COLORS.get(d.category, 1, d.song_id, a)
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
                 updateTimeAndIndexDisplay(info.object, info.index)
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
    */
    categorize() {

        // pick points in this plot
        var pickedPoints = this.renderer.pickMultipleObjects({
            x: this._local_mouse.x,
            y: this._local_mouse.y,
            radius: 20,
            depth: 40,
        })


        if (pickedPoints.length > 1) {
            /* recolor all points with current category */
            for (let i = 0; i < pickedPoints.length; i++) {
                var c = pickedPoints[i].object.category
                var index = pickedPoints[i].object.id
                if (c !== this._current_category) {
                    // add previous point to historyt
                    this._history.add([index, c])

                    // set new color
                    pickedPoints[i].object.category = this._current_category;
                }
            }

            /* re-render canvas after update */
            this.updateColors()
        }
    }


    updateAudioList(o) {
        var pointsInRadius = this.renderer.pickMultipleObjects({
            x: this._local_mouse.x, y: this._local_mouse.y,
            radius: 10,
            depth: 5,
        });

        /* randomize points */
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
            var p = pointsInRadius[i].object;
            o.hooverPlay(p.id, p.start, p.length, p.song_id)
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
}
