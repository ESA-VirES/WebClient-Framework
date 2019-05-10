/*global $ _ define d3 Cesium msgpack plotty DrawHelper saveAs showMessage */
/*global defaultFor getISODateTimeString meanDate */
/*global SCALAR_PARAM VECTOR_PARAM VECTOR_BREAKDOWN */

define([
    'backbone.marionette',
    'communicator',
    'app',
    'models/MapModel',
    'globals',
    'httpRequest',
    'hbs!tmpl/wps_eval_composed_model',
    'hbs!tmpl/wps_get_field_lines',
    'hbs!tmpl/FieldlinesLabel',
    'cesium/Cesium',
    'drawhelper',
    'FileSaver',
    'msgpack',
    'plotty'
], function (
    Marionette, Communicator, App, MapModel, globals, httpRequest,
    tmplEvalModel, tmplGetFieldLines, tmplFieldLinesLabel
) {
    'use strict';

    // Special 'ellipsoid' for conversion from geocentric spherical coordinates.
    // This datum is a sphere with radius of 1mm.
    var GEOCENTRIC_SPHERICAL = {
        radiiSquared: new Cesium.Cartesian3(1e-6, 1e-6, 1e-6)
    };

    var CesiumView = Marionette.View.extend({
        model: new MapModel.MapModel(),

        initialize: function (options) {
            this.map = undefined;
            this.isClosed = true;
            this.tileManager = options.tileManager;
            this.selectionType = null;
            this.overlayIndex = 99;
            this.diffimageIndex = this.overlayIndex - 10;
            this.diffOverlay = null;
            this.overlayLayers = [];
            this.overlayOffset = 100;
            this.cameraIsMoving = false;
            this.cameraLastPosition = null;
            this.billboards = null;
            this.FLbillboards = null;
            this.activeFL = [];
            this.featuresCollection = {};
            this.FLCollection = {};
            this.FLData = {};
            this.FLStoredData = {};
            this.bboxsel = null;
            this.extentPrimitive = null;
            this.activeModels = [];
            this.activeCollections = [];
            this.dataFilters = {};
            this.colorscales = {};
            this.beginTime = null;
            this.endTime = null;
            this.plot = null;
            this.connectDataEvents();
        },

        createMap: function () {
            // Problem arose in some browsers where aspect ratio was kept not adapting
            // to height; Added height style attribute to 100% to solve problem
            this.$el.attr('style', 'height:100%;');

            // TODO: We dont use bing maps layer, but it still reports use of default key in console.
            // For now we just set it to something else just in case.
            Cesium.BingMapsApi.defaultKey = 'NOTHING';
            Cesium.Camera.DEFAULT_VIEW_RECTANGLE = Cesium.Rectangle.fromDegrees(0.0, -10.0, 30.0, 55.0);

            Cesium.WebMapServiceImageryProvider.prototype.updateProperties = function (property, value) {
                property = '&' + property + '=';
                value = '' + value;
                var index = _.indexOf(this._tileProvider._urlParts, property);
                if (index >= 0) {
                    this._tileProvider._urlParts[index + 1] = encodeURIComponent(value);
                } else {
                    this._tileProvider._urlParts.push(property);
                    this._tileProvider._urlParts.push(encodeURIComponent(value));
                }
            };

            this.$el.append('<div id="fieldlines_label" class="hidden"></div>');
            this.$el.append('<div id="coordinates_label"></div>');
            this.$el.append('<div id="cesium_attribution"></div>');
            this.$el.append('<div id="cesium_custom_attribution"></div>');
            $('#cesium_custom_attribution').append(
                '<div style="float:left"><a href="http://cesiumjs.org" target="_blank">Cesium</a>' +
                '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>'
            );

            this.$el.append('<div type="button" class="btn btn-success darkbutton" id="cesium_save">Save as Image</div>');
            this.$el.append('<div type="button" class="btn btn-success darkbutton"  id="bb_selection">Select Area</div>');

            this.$el.append('<div id="poleViewDiv"></div>');
            $('#poleViewDiv').append('<button class="btn btn-success darkbutton dropdown-toggle" title="Pole View Selection" id="poleViewButton" data-toggle="dropdown">Globe View</button>');
            $('#poleViewDiv').append('<ul id="poleViewUl" class="dropdown-menu"></ul>');
            $('#poleViewUl').append('<li><button class="btn btn-success darkbutton magN poleButton" title="Magnetic North Pole">Mag. North</button></li>');
            $('#poleViewUl').append('<li><button class="btn btn-success darkbutton magS poleButton" title="Magnetic South Pole">Mag. South</button></li>');
            $('#poleViewUl').append('<li><button class="btn btn-success darkbutton geoN poleButton" title="Geographic North Pole">Geo. North</button></li>');
            $('#poleViewUl').append('<li><button class="btn btn-success darkbutton geoS poleButton" title="Geographic South Pole">Geo. South</button></li>');
            $('#poleViewUl').append('<li><button class="btn btn-success darkbutton poleButton" id="resetCameraView" title="Reset to the free Globe View.">Reset View</button></li>');

            this.bindPolarButtons();

            this.$el.append('<input type="text" class="bboxEdit hidden"  id="bboxWestForm" placeholder="West">');
            this.$el.append('<input type="text" class="bboxEdit hidden"  id="bboxEastForm" placeholder="East">');
            this.$el.append('<input type="text" class="bboxEdit hidden"  id="bboxNorthForm" placeholder="North">');
            this.$el.append('<input type="text" class="bboxEdit hidden"  id="bboxSouthForm" placeholder="South">');
            this.fillBboxForms();
            this.$el.append('<input type="button" class="bboxEdit hidden"  id="bboxEditConfirm" value="✔">');
            // hide cesium tooltip on hover over the forms
            $(".bboxEdit").hover(function () {
                $(".twipsy").addClass("hidden");
            }, function () {
                $(".twipsy").removeClass("hidden");
            });
            $("#bboxEditConfirm").click(this.submitCoordinateForms.bind(this));
            $(".bboxEdit").keypress(function (evt) {
                // confirm forms on enter too
                if (evt.keyCode === 13) {
                    this.submitCoordinateForms();
                }
            }.bind(this));

            this.colors = globals.objects.get('color');

            if (this.beginTime === null || this.endTime === null) {
                var selTime = Communicator.reqres.request('get:time');
                this.beginTime = selTime.start;
                this.endTime = selTime.end;
            }

            var baseLayers = [];
            var initialLayer = null;
            globals.baseLayers.each(function (baselayer) {
                var layer = this.createLayer(baselayer);
                baseLayers.push(layer);
                if (baselayer.get('visible')) {
                    initialLayer = layer;
                }
            }, this);

            var clock = new Cesium.Clock({
                startTime: Cesium.JulianDate.fromIso8601('2014-01-01'),
                currentTime: Cesium.JulianDate.fromIso8601('2014-01-02'),
                stopTime: Cesium.JulianDate.fromIso8601('2014-01-03'),
                clockRange: Cesium.ClockRange.LOOP_STOP,
                clockStep: Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER,
                canAnimate: false,
                shouldAnimate: false
            });

            if (initialLayer) {
                var options = {
                    timeline: false,
                    fullscreenButton: false,
                    baseLayerPicker: false,
                    homeButton: false,
                    infoBox: false,
                    navigationHelpButton: false,
                    navigationInstructionsInitiallyVisible: false,
                    animation: false,
                    imageryProvider: initialLayer,
                    terrainProvider: new Cesium.CesiumTerrainProvider({
                        url: '//dem.maps.eox.at/'
                    }),
                    creditContainer: 'cesium_attribution',
                    contextOptions: {webgl: {preserveDrawingBuffer: true}},
                    clock: clock
                };
                //COLUMBUS_VIEW SCENE2D SCENE3D
                if (localStorage.getItem('sceneMode') !== null) {
                    options.sceneMode = Number(localStorage.getItem('sceneMode'));
                    if (options.sceneMode !== 3) {
                        $('#poleViewDiv').addClass("hidden");
                    }
                }
                this.map = new Cesium.Viewer(this.el, options);
                var initialCesiumLayer = this.map.imageryLayers.get(0);
            }

            if (localStorage.getItem('cameraPosition') !== null) {
                var c = JSON.parse(localStorage.getItem('cameraPosition'));
                this.map.scene.camera.position = new Cesium.Cartesian3(
                    c.position[0], c.position[1], c.position[2]
                );
                this.map.scene.camera.direction = new Cesium.Cartesian3(
                    c.direction[0], c.direction[1], c.direction[2]
                );
                this.map.scene.camera.up = new Cesium.Cartesian3(
                    c.up[0], c.up[1], c.up[2]
                );
                this.map.scene.camera.right = new Cesium.Cartesian3(
                    c.right[0], c.right[1], c.right[2]
                );
            }

            var mm = globals.objects.get('mapmodel');

            this.navigationhelp = new Cesium.NavigationHelpButton({
                container: $('.cesium-viewer-toolbar')[0]
            });

            this.map.scene.morphStart.addEventListener(function () {
                this.globalViewZoomReset();
            }.bind(this));

            this.map.scene.morphComplete.addEventListener(function () {
                // change of mode event handler
                if (this.map._sceneModePicker.viewModel.sceneMode !== 3) {
                    $('#poleViewDiv').addClass("hidden");
                } else {
                    $('#poleViewDiv').removeClass("hidden");
                }
            }.bind(this));

            this.map.scene.skyBox.show = mm.get('skyBox');
            this.map.scene.sun.show = mm.get('sun');
            this.map.scene.moon.show = mm.get('moon');
            this.map.scene.skyAtmosphere.show = mm.get('skyAtmosphere');
            this.map.scene.backgroundColor = new Cesium.Color.fromCssColorString(
                mm.get('backgroundColor')
            );

            // TODO: Removes fog for now as it is not very good at this point
            if (this.map.scene.hasOwnProperty('fog')) {
                this.map.scene.fog.enabled = false;
            }

            // Remove gazetteer field
            $('.cesium-viewer-geocoderContainer').remove();

            // Show Wireframe (Debug help)
            //this.map.scene.globe._surface._tileProvider._debug.wireframe = true;

            var handler = new Cesium.ScreenSpaceEventHandler(
                this.map.scene.canvas
            );
            handler.setInputAction(function () {
                //hide the selectionIndicator
                this.map.selectionIndicator.viewModel.selectionIndicatorElement.style.visibility = 'hidden';
            }.bind(this), Cesium.ScreenSpaceEventType.LEFT_CLICK);

            handler.setInputAction(function (movement) {
                var ellipsoid = Cesium.Ellipsoid.WGS84;
                var position = this.map.scene.camera.pickEllipsoid(movement.endPosition, ellipsoid);
                $('#coordinates_label').hide();
                if (Cesium.defined(position)) {
                    var cartographic = ellipsoid.cartesianToCartographic(position);
                    var lat = Cesium.Math.toDegrees(cartographic.latitude);
                    var lon = Cesium.Math.toDegrees(cartographic.longitude);
                    //var height = cartographic.height;
                    $('#coordinates_label').show();
                    $('#coordinates_label').html(
                        'Lat: ' + lat.toFixed(4) + '</br>Lon: ' + lon.toFixed(4)
                    );
                    // prefill coordinates in bbox edit forms when user already clicked on map to draw a rectangle
                    if ($('#bb_selection').text() === "Deactivate") {
                        if ($('.twipsy-inner p').length === 2) {
                            // could not find a way to hook up on events of external cesium drawing plugin, so watching for when a new tooltip appears
                            if (this.bboxEdit === undefined) {
                                // first click on globe, save start
                                this.bboxEdit = {};
                                this.bboxEdit.n = lat;
                                this.bboxEdit.w = lon;
                            } else {
                                // all other mouse movements, save second border, recompute bbox if necessary and save to forms
                                this.bboxEdit.e = lon;
                                this.bboxEdit.s = lat;
                                this.fillBboxFormsWhileDrawing(this.bboxEdit);
                            }
                        }

                    }
                }
            }.bind(this), Cesium.ScreenSpaceEventType.MOUSE_MOVE);

            this.billboards = this.map.scene.primitives.add(
                new Cesium.BillboardCollection()
            );
            this.FLbillboards = this.map.scene.primitives.add(
                new Cesium.BillboardCollection()
            );
            this.drawhelper = new DrawHelper(this.map.cesiumWidget);
            // It seems that if handlers are active directly there are some
            // object deleted issues when the draw helper tries to pick elements
            // in the scene; Setting handlers muted in the beginning seems to
            // solve the issue.
            this.drawhelper._handlersMuted = true;

            this.cameraLastPosition = {};
            this.cameraLastPosition.x = this.map.scene.camera.position.x;
            this.cameraLastPosition.y = this.map.scene.camera.position.y;
            this.cameraLastPosition.z = this.map.scene.camera.position.z;

            // Extend far clipping for fieldlines
            this.map.scene.camera.frustum.far = this.map.scene.camera.frustum.far * 15;

            this.map.clock.onTick.addEventListener(this.handleTick.bind(this));

            //Go through all defined baselayer and add them to the map
            for (var i = 0; i < baseLayers.length; i++) {
                globals.baseLayers.each(function (baselayer) {
                    if (initialLayer._layer === baselayer.get('views')[0].id) {
                        baselayer._cesiumLayer = initialCesiumLayer;
                    } else {
                        if (baseLayers[i]._layer === baselayer.get('views')[0].id) {
                            var imagerylayer = this.map.scene.imageryLayers.addImageryProvider(baseLayers[i]);
                            imagerylayer.show = baselayer.get('visible');
                            baselayer._cesiumLayer = imagerylayer;
                        }
                    }
                }, this);
            }

            // Go through all products and add them to the map
            _.each(
                globals.products.last(globals.products.length).reverse(),
                function (product) {
                    var layer = this.createLayer(product);
                    if (!layer) return;
                    var imagerylayer = this.map.scene.imageryLayers.addImageryProvider(layer);
                    product._cesiumLayer = imagerylayer;

                    imagerylayer.show = product.get('visible');
                    imagerylayer.alpha = product.get('opacity');

                    // If product protocol is not WMS or WMTS they are
                    // shown differently so dont activate 'dummy' layers
                    if (product.get('views')[0].protocol !== 'WMS' &&
                        product.get('views')[0].protocol !== 'WMTS') {
                        imagerylayer.show = false;
                    }
                    // If product is model and active parameters is Fieldline
                    // do not activate dummy layer and check for fieldlines
                    if (product.get('model')) {
                        var activeKey = this.getSelectedVariable(product.get('parameters'));
                        if (activeKey === 'Fieldlines') {
                            imagerylayer.show = false;
                        }
                        // add extra later for the custom model
                        imagerylayer = this.map.scene.imageryLayers.addImageryProvider(this.createWPSLayer());
                        imagerylayer.show = false;
                        product._cesiumLayerCustom = imagerylayer;
                    }
                }, this
            );

            // Go through all overlays and add them to the map
            globals.overlays.each(function (overlay) {
                var layer = this.createLayer(overlay);
                if (layer) {
                    var imagerylayer = this.map.scene.imageryLayers.addImageryProvider(layer);
                    imagerylayer.show = overlay.get('visible');
                    overlay._cesiumLayer = imagerylayer;
                }
            }, this);

            this.map.scene.morphComplete.addEventListener(function () {
                localStorage.setItem('sceneMode', this.map.scene.mode);
                var c = this.map.scene.camera;
                localStorage.setItem('cameraPosition',
                    JSON.stringify({
                        position: [c.position.x, c.position.y, c.position.z],
                        direction: [c.direction.x, c.direction.y, c.direction.z],
                        up: [c.up.x, c.up.y, c.up.z],
                        right: [c.right.x, c.right.y, c.right.z]
                    })
                );
            }, this);
            // add event handler for fieldlines click
            var scene = this.map.scene;
            var handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
            handler.setInputAction(function (click) {
                var pickedObject = scene.pick(click.position);
                if (Cesium.defined(pickedObject) && typeof pickedObject.id !== 'undefined' && pickedObject.id.toString().indexOf('vec_line_fl') !== -1) {
                    this.onFieldlineClicked(pickedObject, click.position);
                } else {
                    this.hideFieldLinesLabel();
                }
            }.bind(this), Cesium.ScreenSpaceEventType.LEFT_CLICK);
        }, // END of createMap

        onShow: function () {
            if (!this.map) {
                this.createMap();
            }

            // Check for possible already available selection
            if (localStorage.getItem('areaSelection') !== null) {
                var bbox = JSON.parse(localStorage.getItem('areaSelection'));
                if (bbox) {
                    this.bboxsel = [bbox.s, bbox.w, bbox.n, bbox.e];
                }
            }

            if (this.navigationhelp) {
                this.navigationhelp.destroy();
                this.navigationhelp = new Cesium.NavigationHelpButton({
                    container: $('.cesium-viewer-toolbar')[0]
                });
            }
            this.plot = new plotty.plot({});
            this.plot.setClamp(true, true);
            this.isClosed = false;

            $('#cesium_save').on('click', this.onSaveImage.bind(this));

            function synchronizeLayer(l) {
                if (l._cesiumLayer) {
                    if (l._cesiumLayer.show !== l.get('visible')) {
                        var isBaseLayer = defaultFor(l.get('view').isBaseLayer, false);
                        this.changeLayer({
                            name: l.get('name'), visible: l.get('visible'),
                            isBaseLayer: isBaseLayer
                        });
                    }
                }
            }
            function synchronizeColorLegend(p) {
                this.checkColorscale(p.get('download').id);
            }
            // Go through config to make any changes done while widget
            // not active (not in view)
            globals.baseLayers.each(synchronizeLayer, this);
            globals.products.each(synchronizeLayer, this);
            globals.overlays.each(synchronizeLayer, this);

            // Recheck color legends
            globals.products.each(synchronizeColorLegend, this);

            this.connectDataEvents();

            // Redraw to make sure we are at current selection
            this.createDataFeatures(
                globals.swarm.get('data'),
                'pointcollection', 'band'
            );

            $('#bb_selection').unbind('click');
            $('#bb_selection').click(function () {
                if ($('#bb_selection').text() === 'Select Area') {
                    $('#bb_selection').html('Deactivate');
                    $('.bboxEdit').removeClass('hidden');
                    $('#bboxWestForm')[0].focus();
                    $('#bboxWestForm')[0].select();
                    Communicator.mediator.trigger('selection:activated', {
                        id: 'bboxSelection',
                        active: true,
                        selectionType: 'single'
                    });
                } else if ($('#bb_selection').text() === 'Deactivate') {
                    $('#bb_selection').html('Select Area');
                    $('.bboxEdit').addClass('hidden');
                    Communicator.mediator.trigger('selection:activated', {
                        id: 'bboxSelection',
                        active: false,
                        selectionType: 'single'
                    });
                } else if ($('#bb_selection').text() === 'Clear Selection') {
                    $('#bb_selection').html('Select Area');
                    $('.bboxEdit').addClass('hidden');
                    //clear selection to enable new draw save
                    delete this.bboxEdit;
                    Communicator.mediator.trigger('selection:changed', null);
                }
            }.bind(this));
            return this;
        }, // END of onShow

        fillBboxForms: function () {
            // fill bbox forms from localstorage data
            if (localStorage.getItem('areaSelection') !== "null" && localStorage.getItem('areaSelection') !== null) {
                var bbox = JSON.parse(localStorage.getItem('areaSelection'));
                $("#bboxWestForm").val(parseFloat(bbox.w).toFixed(4));
                $("#bboxEastForm").val(parseFloat(bbox.e).toFixed(4));
                $("#bboxNorthForm").val(parseFloat(bbox.n).toFixed(4));
                $("#bboxSouthForm").val(parseFloat(bbox.s).toFixed(4));
            }
        },

        fillBboxFormsWhileDrawing: function (bbox) {
            // fill bbox forms with given bbox and fix it if necessary
            var bboxFixed = this.wrapBbox(bbox);
            $("#bboxWestForm").val(bboxFixed.w.toFixed(4));
            $("#bboxEastForm").val(bboxFixed.e.toFixed(4));
            $("#bboxNorthForm").val(bboxFixed.n.toFixed(4));
            $("#bboxSouthForm").val(bboxFixed.s.toFixed(4));
        },

        connectDataEvents: function () {
            globals.swarm.on('change:data', function (model, data) {
                var refKey = 'Timestamp';
                if (!data.hasOwnProperty(refKey)) {
                    refKey = 'timestamp';
                }
                if (data.hasOwnProperty(refKey) && data[refKey].length > 0) {
                    this.createDataFeatures(data, 'pointcollection', 'band');
                } else {
                    for (var i = 0; i < this.activeCollections.length; i++) {
                        if (this.featuresCollection.hasOwnProperty(this.activeCollections[i])) {
                            this.map.scene.primitives.remove(
                                this.featuresCollection[this.activeCollections[i]]
                            );
                            delete this.featuresCollection[this.activeCollections[i]];
                        }
                    }
                    this.activeCollections = [];
                }
            }, this);

            globals.swarm.on('change:filters', function (model, filters) {
                this.createDataFeatures(globals.swarm.get('data'), 'pointcollection', 'band');
            }, this);
        },

        onResize: function () {
            this.bindPolarButtons();
            if (this.map._sceneModePicker) {
                var container = this.map._sceneModePicker.container;
                var scene = this.map._sceneModePicker.viewModel._scene;
                var modepicker = new Cesium.SceneModePicker(container, scene);
                this.map._sceneModePicker = modepicker;
            }
        },

        //method to create layer depending on protocol
        //setting possible description attributes

        createLayer: function (layerdesc) {

            var view = this.getView(layerdesc);

            // Manage custom attribution element (add attribution for active layers)
            if (layerdesc.get('visible')) {
                this.addCustomAttribution(view);
            }

            switch (view.protocol) {
                case 'WMTS':
                    return this.createWMTSLayer(layerdesc, view);
                case 'WMS':
                    return this.createWMSLayer(layerdesc, view);
                case 'WPS':
                    return this.createWPSLayer();
                default: // No supported view available
                    return false;
            }
        },

        getView: function (layerdesc) {
            var views = layerdesc.get('views');
            var view = layerdesc.get('view');

            if (!views && view) {return view;}
            if (views.length === 1) {return views[0];}

            // FIXXME: this whole logic has to be replaced by a more robust method, i.e. a viewer
            // defines, which protocols to support and get's the corresponding views from the
            // config then.

            // When both available WMTS preferred over WMS.
            view = _.find(views, function (view) {
                return view.protocol === 'WMTS';
            });
            if (view) {return view;}

            view = _.find(views, function (view) {
                return view.protocol === 'WMS';
            });
            if (view) {return view;}

            // No supported protocol defined in config.json!
            return null;
        },

        createWMTSLayer: function (layerdesc, view) {
            var options = {
                url: view.urls[0],
                layer: view.id,
                style: view.style,
                format: view.format,
                tileMatrixSetID: view.matrixSet,
                maximumLevel: 13,
                tilingScheme: new Cesium.GeographicTilingScheme({
                    numberOfLevelZeroTilesX: 2, numberOfLevelZeroTilesY: 1
                }),
                credit: new Cesium.Credit(view.attribution),
                show: layerdesc.get('visible')
            };
            if (view.hasOwnProperty('urlTemplate') && view.hasOwnProperty('subdomains')) {
                options.url = view.urlTemplate;
                options.subdomains = view.subdomains;
            }
            return new Cesium.WebMapTileServiceImageryProvider(options);
        },

        createWMSLayer: function (layerdesc, view) {
            var params = $.extend({
                transparent: 'true',
            }, Cesium.WebMapServiceImageryProvider.DefaultParameters);

            // Check if layer has additional parameters configured
            var addParams = {transparent: true};
            var styles;
            if (layerdesc.get('parameters')) {
                _.each(layerdesc.get('parameters'), function (options, key) {
                    if (options.selected) {
                        addParams.dim_bands = key;
                        addParams.dim_range = [
                            options.range[0], options.range[1]
                        ].join(',');
                        styles = options.colorscale;
                    }
                });
            }
            addParams.styles = styles;
            if (layerdesc.get('timeSlider')) {
                addParams.time = [
                    getISODateTimeString(this.beginTime),
                    getISODateTimeString(this.endTime)
                ].join('/');
            }
            if (layerdesc.get('height')) {
                addParams.elevation = layerdesc.get('height');
            }
            if (layerdesc.get('model')) {
                addParams.models = layerdesc.getModelExpression(view.id);
            }
            params.format = layerdesc.get('views')[0].format;
            var layer = new Cesium.WebMapServiceImageryProvider({
                url: view.urls[0],
                layers: view.id,
                tileWidth: layerdesc.get('tileSize'),
                tileHeight: layerdesc.get('tileSize'),
                enablePickFeatures: false,
                parameters: params
            });

            for (var par in addParams) {
                layer.updateProperties(par, addParams[par]);
            }

            return layer;
        },

        createWPSLayer: function () {
            return new Cesium.SingleTileImageryProvider({
                url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
            });
        },

        centerMap: function (data) {
            //this.map.setCenter(new OpenLayers.LonLat(data.x, data.y), data.l);
            this.model.set({
                'center': [data.x, data.y],
                'zoom': data.l
            });
        },

        onSortProducts: function (shifts) {
            // Search for moved layer
            // Sorting only works on model layers so we filter them out first
            globals.products.each(function (product) {
                var cesLayer = product._cesiumLayer;
                if (cesLayer && shifts.hasOwnProperty(product.get('name'))) {
                    // Raise or Lower the layer depending on movement
                    var toMove = shifts[product.get('name')];
                    for (var i = 0; i < Math.abs(toMove); ++i) {
                        if (toMove < 0) {
                            this.map.scene.imageryLayers.lower(cesLayer);
                        } else if (toMove > 0) {
                            this.map.scene.imageryLayers.raise(cesLayer);
                        }
                    }
                }
            }, this);
            console.log('Map products sorted');
        },

        onModelsUpdate: function () {
            _.each(
                globals.products.filter(function (product) {
                    return product.get('model') && product.get('visible');
                }),
                function (product) {
                    this.checkColorscale(product.get('download').id);
                }, this
            );
        },

        onUpdateOpacity: function (options) {
            var modelId = options.model.get('download').id;
            var collectionId = options.model.get('views')[0].id;
            _.each(
                globals.products.filter(function (product) {
                    return product.get('download').id === modelId;
                }),
                function (product) {

                    // Find active parameter and satellite
                    var key = this.getSelectedVariable(product.get('parameters'));
                    var sat = globals.swarm.collection2satellite[collectionId];

                    if (sat && key && _.has(this.featuresCollection, (sat + key))) {
                        var fc = this.featuresCollection[(sat + key)];
                        if (fc.hasOwnProperty('geometryInstances')) {
                            for (var i = fc._instanceIds.length - 1; i >= 0; i--) {
                                var attributes = fc.getGeometryInstanceAttributes(fc._instanceIds[i]);
                                var nc = attributes.color;
                                nc[3] = Math.floor(options.value * 255);
                                attributes.color = Cesium.ColorGeometryInstanceAttribute.toValue(
                                    Cesium.Color.fromBytes(nc[0], nc[1], nc[2], nc[3])
                                );
                            }
                        } else {
                            for (var i = fc.length - 1; i >= 0; i--) {
                                var c, b = fc.get(i);
                                if (b.color) {
                                    c = b.color.clone();
                                    c.alpha = options.value;
                                    b.color = c;
                                } else if (b.appearance) {
                                    c = b.appearance.material.uniforms.color.clone();
                                    c.alpha = options.value;
                                    b.appearance.material.uniforms.color = c;
                                }
                            }
                        }
                    } else {
                        if (this.isCustomModelSelected(product)) {
                            product._cesiumLayerCustom.alpha = options.value;
                        } else {
                            product._cesiumLayer.alpha = options.value;
                        }
                    }
                }, this
            );
        },

        addCustomAttribution: function (view) {
            if (view.hasOwnProperty('attribution')) {
                $('#cesium_custom_attribution').append(
                    '<div id="' + view.id.replace(/[^A-Z0-9]/ig, '_') +
                    '" style="float: left; margin-left: 3px;">' +
                    view.attribution + '</div>'
                );
            }
        },

        removeCustomAttribution: function (view) {
            $('#' + view.id.replace(/[^A-Z0-9]/ig, '_')).remove();
        },

        changeLayer: function (options) {
            // Seems for some reason that a layer needs to be as shown at all times
            // or cesium will throw an error, so first activate the new layer, then
            // deactivate the others
            if (options.isBaseLayer) {
                globals.baseLayers.each(function (baselayer) {
                    var cesLayer = baselayer._cesiumLayer;
                    if (cesLayer) {
                        if (baselayer.get('name') === options.name) {
                            cesLayer.show = true;
                            this.addCustomAttribution(baselayer.get('views')[0]);
                        }
                    }
                }, this);

                globals.baseLayers.each(function (baselayer) {
                    var cesLayer = baselayer._cesiumLayer;
                    if (cesLayer) {
                        if (baselayer.get('name') !== options.name) {
                            cesLayer.show = false;
                            this.removeCustomAttribution(baselayer.get('views')[0]);
                        }
                    }
                }, this);

            } else {
                globals.overlays.each(function (overlay) {
                    if (overlay.get('name') === options.name) {
                        var cesLayer = overlay._cesiumLayer;
                        cesLayer.show = options.visible;
                        if (options.visible) {
                            this.addCustomAttribution(overlay.get('view'));
                        } else {
                            this.removeCustomAttribution(overlay.get('view'));
                        }
                    }
                }, this);

                globals.products.each(function (product) {
                    if (product.get('name') === options.name) {
                        product.set('visible', options.visible);
                        this.checkColorscale(product.get('download').id);

                        if (product.get('model') && this.isCustomModelSelected(product)) {
                            // When custom SHC selected switch to WPS visualization.
                            this.updateCustomModel(product);
                        } else if (product.get('views')[0].protocol === 'WMS' ||
                                  product.get('views')[0].protocol === 'WMTS') {
                            var cesLayer;
                            var parameters = product.get('parameters');
                            if (parameters) {
                                var band = this.getSelectedVariable(parameters);
                                var style = parameters[band].colorscale;
                                var range = parameters[band].range;

                                if (band === 'Fieldlines') {
                                    this.updateActiveFL(product);
                                    this.updateFieldLines();
                                } else {

                                    cesLayer = product._cesiumLayer;
                                    if (band) {
                                        cesLayer.imageryProvider.updateProperties(
                                            'dim_bands', band
                                        );
                                    }
                                    if (range) {
                                        cesLayer.imageryProvider.updateProperties(
                                            'dim_range', (range[0] + ',' + range[1])
                                        );
                                    }
                                    if (style) {
                                        cesLayer.imageryProvider.updateProperties(
                                            'styles', style
                                        );
                                    }
                                    if (product.get('model')) {
                                        cesLayer.imageryProvider.updateProperties(
                                            'models', product.getModelExpression(product.get('download').id)
                                        );
                                    }
                                    cesLayer.show = options.visible;
                                }

                            } else {
                                cesLayer = product._cesiumLayer;
                                cesLayer.show = options.visible;
                            }
                        } // END of WMS and WMTS case
                    }

                    if (product.get('model') && product.get('name') === options.name) {
                        if (this.activeModels.indexOf(product.get('name')) !== -1) {
                            this.activeModels.splice(
                                this.activeModels.indexOf(product.get('name')), 1
                            );
                        }

                    }
                }, this); // END of global products loop
            }
        }, // END of changeLayer

        isCustomModelSelected: function (product) {
            return Boolean(product.getCustomShcIfSelected());
        },

        showCustomModel: function (product) {
            var parameters = product.get('parameters');
            var band = this.getSelectedVariable(parameters);

            product._cesiumLayer.show = false; // hide WMS layer

            if (band === 'Fieldlines') {
                this.hideCustomModel(product);
                product._cesiumLayerCustom.show = false; // hide WPS layer
                this.updateFieldLines();
                return;
            }

            var style = parameters[band].colorscale;
            var range = parameters[band].range;

            var options = {
                model_expression: product.getModelExpression(),
                shc: product.getCustomShcIfSelected(),
                variable: band,
                begin_time: getISODateTimeString(this.beginTime),
                end_time: getISODateTimeString(this.endTime),
                elevation: product.get('height'),
                height: 512,
                width: 1024,
                style: style,
                range_min: range[0],
                range_max: range[1],
            };

            if (this.bboxsel !== null) {
                var boundingBox = this.bboxsel;
                options.bbox = boundingBox.join();
            }

            $.post(product.get('views')[0].urls[0], tmplEvalModel(options))
                .done(_.bind(function (data) {
                    var customModelLayer = product._cesiumLayerCustom;
                    customModelLayer.show = false;

                    var layers = this.map.scene.imageryLayers;
                    var index = layers.indexOf(customModelLayer);

                    if (index > 0) {
                        var imageURI = 'data:image/gif;base64,' + data;
                        var layerOptions = {url: imageURI};
                        if (boundingBox && boundingBox.length === 4) {
                            var rec = new Cesium.Rectangle(
                                Cesium.Math.toRadians(boundingBox[1]),
                                Cesium.Math.toRadians(boundingBox[0]),
                                Cesium.Math.toRadians(boundingBox[3]),
                                Cesium.Math.toRadians(boundingBox[2])
                            );
                            layerOptions.rectangle = rec;
                        }
                        layers.remove(customModelLayer);
                        customModelLayer = layers.addImageryProvider(
                            new Cesium.SingleTileImageryProvider(layerOptions), index
                        );
                        customModelLayer.alpha = product.get('opacity');
                        customModelLayer.show = true;
                        product._cesiumLayerCustom = customModelLayer;
                    }
                }, this));
            return true;
        },

        hideCustomModel: function (product) {
            product._cesiumLayerCustom.show = false; // hide WPS layer
            return false;
        },

        updateCustomModel: function (product) {
            if (product.get('visible')) {
                return this.showCustomModel(product);
            } else {
                return this.hideCustomModel(product);
            }
        },

        createDataFeatures: function (results) {
            var refKey = 'Timestamp';
            if (!results.hasOwnProperty(refKey)) {
                refKey = 'timestamp';
            }
            if (results.hasOwnProperty(refKey) && results[refKey].length > 0) {
                // The feature collections are removed directly when a change happens
                // because of the asynchronous behaviour it can happen that a collection
                // is added between removing it and adding another one so here we make sure
                // it is empty before overwriting it, which would lead to a not referenced
                // collection which is no longer deleted.
                // I remove it before the response because a direct feedback to the user is important
                // There is probably a cleaner way to do this
                for (var i = 0; i < this.activeCollections.length; i++) {
                    if (this.featuresCollection.hasOwnProperty(this.activeCollections[i])) {
                        this.map.scene.primitives.remove(this.featuresCollection[this.activeCollections[i]]);
                        delete this.featuresCollection[this.activeCollections[i]];
                    }
                }
                this.activeCollections = [];
                var settings = {};

                globals.products.each(function (product) {
                    if (!product.get('visible')) {return;}

                    var collection = product.get('views')[0].id;
                    var sat = globals.swarm.collection2satellite[collection];

                    if (!sat) {return;}

                    _.each(product.get('parameters'), function (param, name) {
                        if (!param.selected) {return;}
                        if (!settings.hasOwnProperty(sat)) {
                            settings[sat] = {};
                        }
                        if (!settings[sat].hasOwnProperty(k)) {
                            settings[sat][name] = _.clone(param);
                        }
                        _.extend(settings[sat][name], {
                            band: name,
                            alpha: Math.floor(product.get('opacity') * 255),
                            outlines: product.get('outlines'),
                            outline_color: product.get('color')
                        });
                    });
                });

                if (!_.isEmpty(settings)) {

                    _.uniq(results.id)
                        .map(function (obj) {
                            var parameters = _.filter(
                                SCALAR_PARAM,
                                function (par) {
                                    return settings[obj].hasOwnProperty(par);
                                });

                            for (var i = 0; i < parameters.length; i++) {
                                this.activeCollections.push(obj + parameters[i]);
                                this.featuresCollection[obj + parameters[i]] =
                                    new Cesium.PointPrimitiveCollection();
                                if (!this.map.scene.context._gl.getExtension('EXT_frag_depth')) {
                                    this.featuresCollection[obj + parameters[i]]._rs =
                                        Cesium.RenderState.fromCache({
                                            depthTest: {
                                                enabled: true,
                                                func: Cesium.DepthFunction.LESS
                                            },
                                            depthMask: false,
                                            blending: Cesium.BlendingState.ALPHA_BLEND
                                        });
                                }
                            }
                            parameters = _.filter(VECTOR_PARAM, function (par) {
                                return settings[obj].hasOwnProperty(par);
                            });
                            for (var i = 0; i < parameters.length; i++) {
                                this.activeCollections.push(obj + parameters[i]);
                                this.featuresCollection[obj + parameters[i]] = new Cesium.Primitive({
                                    geometryInstances: [],
                                    appearance: new Cesium.PolylineColorAppearance({
                                        translucent: true
                                    }),
                                    releaseGeometryInstances: false
                                });
                            }
                        }, this);

                    var maxRad = this.map.scene.globe.ellipsoid.maximumRadius;
                    var scaltype = new Cesium.NearFarScalar(1.0e2, 4, 14.0e6, 0.8);
                    //var timeBucket = {'Alpha': {}, 'Bravo': {}, 'Charlie': {}};
                    var linecnt = 0;

                    var lastTS = null;
                    for (var r = 0; r < results[refKey].length; r++) {
                        var row = {};
                        for (var k in results) {
                            row[k] = results[k][r];
                        }
                        var show = true;
                        var filters = globals.swarm.get('filters');
                        var heightOffset, color;

                        if (filters) {
                            for (var f in filters) {
                                show = filters[f](row[f]);
                                //show = !(row[k]<filters[k][0] || row[k]>filters[k][1]);
                                if (!show) {break;}
                            }
                        }
                        if (show) {
                            // Find parameter in settings which is also in row
                            // these are the ones that are active
                            var actvParam = _.keys(settings[row.id]);
                            var tovisualize = _.filter(actvParam, function (ap) {
                                // Check if component is vector component
                                if (VECTOR_BREAKDOWN.hasOwnProperty(ap)) {
                                    var b = VECTOR_BREAKDOWN[ap];
                                    return (
                                        row.hasOwnProperty(b[0]) &&
                                        row.hasOwnProperty(b[1]) &&
                                        row.hasOwnProperty(b[2])
                                    );
                                } else {
                                    return row.hasOwnProperty(ap);
                                }
                            });

                            for (var i = tovisualize.length - 1; i >= 0; i--) {
                                var set = settings[row.id][tovisualize[i]];
                                var alpha = set.alpha;
                                this.plot.setColorScale(set.colorscale);
                                this.plot.setDomain(set.range);

                                if (_.find(SCALAR_PARAM, function (par) {
                                    return set.band === par;
                                })) {
                                    if (tovisualize[i] === 'Bubble_Probability') {
                                        if (row[set.band] <= 0.1) {
                                            continue;
                                        }
                                    }
                                    heightOffset = i * 210000;

                                    if (!isNaN(row[set.band])) {
                                        color = this.plot.getColor(row[set.band]);
                                        var options = {
                                            position: new Cesium.Cartesian3.fromDegrees(
                                                row.Longitude, row.Latitude,
                                                row.Radius - maxRad + heightOffset
                                            ),
                                            color: new Cesium.Color.fromBytes(
                                                color[0], color[1], color[2], alpha
                                            ),
                                            pixelSize: 8,
                                            scaleByDistance: scaltype
                                        };
                                        if (set.outlines) {
                                            options.outlineWidth = 0.5;
                                            options.outlineColor =
                                                Cesium.Color.fromCssColorString(set.outline_color);
                                        }
                                        this.featuresCollection[row.id + set.band].add(options);
                                    }

                                } else if (
                                    _.find(VECTOR_PARAM, function (par) {
                                        return set.band === par;
                                    })) {

                                    if (tovisualize[i] === 'Absolute_STEC' ||
                                       tovisualize[i] === 'Absolute_VTEC' ||
                                       tovisualize[i] === 'Elevation_Angle' ||
                                       tovisualize[i] === 'Relative_STEC' ||
                                       tovisualize[i] === 'Relative_STEC_RMS') {
                                        if (lastTS === null) {
                                            lastTS = row.Timestamp;
                                        }
                                        var diff = row.Timestamp.getTime() - lastTS.getTime();
                                        if (diff <= 40000 && diff > 0) {
                                            //lastTS = row.Timestamp;
                                            continue;
                                        }

                                        lastTS = row.Timestamp;


                                        color = this.plot.getColor(row[set.band]);
                                        //var addLen = 10;
                                        var dir = [
                                            row.GPS_Position_X - row.LEO_Position_X,
                                            row.GPS_Position_Y - row.LEO_Position_Y,
                                            row.GPS_Position_Z - row.LEO_Position_Z
                                        ];
                                        var len = Math.sqrt((dir[0] * dir[0]) + (dir[1] * dir[1]) + (dir[2] * dir[2]));
                                        var uvec = dir.map(function (x) {return x / len;});
                                        var secPos = [
                                            row.LEO_Position_X + uvec[0] * 500000,
                                            row.LEO_Position_Y + uvec[1] * 500000,
                                            row.LEO_Position_Z + uvec[2] * 500000
                                        ];

                                        this.featuresCollection[row.id + set.band].geometryInstances.push(
                                            new Cesium.GeometryInstance({
                                                geometry: new Cesium.PolylineGeometry({
                                                    positions: [
                                                        new Cesium.Cartesian3(row.LEO_Position_X, row.LEO_Position_Y, row.LEO_Position_Z),
                                                        new Cesium.Cartesian3(secPos[0], secPos[1], secPos[2])
                                                    ],
                                                    followSurface: false,
                                                    width: 1.7,
                                                    vertexFormat: Cesium.PolylineColorAppearance.VERTEX_FORMAT
                                                }),
                                                id: 'vec_line_' + linecnt,
                                                attributes: {
                                                    color: Cesium.ColorGeometryInstanceAttribute.fromColor(
                                                        new Cesium.Color.fromBytes(color[0], color[1], color[2], alpha)
                                                    )
                                                }
                                            })
                                        );

                                        linecnt++;

                                    } else {

                                        var sb = VECTOR_BREAKDOWN[set.band];
                                        heightOffset = i * 210000;

                                        // Check if residuals are active!
                                        if (!isNaN(row[sb[0]]) &&
                                           !isNaN(row[sb[1]]) &&
                                           !isNaN(row[sb[2]])) {
                                            var vLen = Math.sqrt(Math.pow(row[sb[0]], 2) + Math.pow(row[sb[1]], 2) + Math.pow(row[sb[2]], 2));
                                            color = this.plot.getColor(vLen);
                                            var addLen = 10;
                                            var vN = (row[sb[0]] / vLen) * addLen;
                                            var vE = (row[sb[1]] / vLen) * addLen;
                                            var vC = (row[sb[2]] / vLen) * addLen;
                                            this.featuresCollection[row.id + set.band].geometryInstances.push(
                                                new Cesium.GeometryInstance({
                                                    geometry: new Cesium.PolylineGeometry({
                                                        positions: Cesium.Cartesian3.fromDegreesArrayHeights([
                                                            row.Longitude, row.Latitude, (row.Radius - maxRad + heightOffset),
                                                            (row.Longitude + vE), (row.Latitude + vN), ((row.Radius - maxRad) + vC * 30000)
                                                        ]),
                                                        followSurface: false,
                                                        width: 1.7
                                                    }),
                                                    id: 'vec_line_' + linecnt,
                                                    attributes: {
                                                        color: Cesium.ColorGeometryInstanceAttribute.fromColor(
                                                            new Cesium.Color.fromBytes(color[0], color[1], color[2], alpha)
                                                        )
                                                    }
                                                })
                                            );
                                            linecnt++;
                                        }

                                    }

                                } // END of if vector parameter
                            }
                        }
                    }

                    for (var j = 0; j < this.activeCollections.length; j++) {
                        this.map.scene.primitives.add(this.featuresCollection[this.activeCollections[j]]);
                    }
                }
            }
        },

        onLayerOutlinesChanged: function (collection) {
            this.createDataFeatures(globals.swarm.get('data'), 'pointcollection', 'band');
        },

        onLayerParametersChanged: function (layer, onlyStyleChange) {
            // optional bool argument onlyStyleChange to allow fieldlines re-rendering without fetching new data

            var product = globals.products.find(function (product) {
                return product.get('name') === layer;
            });

            if (product === undefined) {
                return;
            } else if (product.get('views')[0].protocol === 'CZML') {
                this.createDataFeatures(globals.swarm.get('data'), 'pointcollection', 'band');
            } else if (product.get('views')[0].protocol === 'WMS') {
                var variable = this.getSelectedVariable(product.get('parameters'));

                if (variable === 'Fieldlines') {
                    this.hideCustomModel(product);
                    this.hideWMSLayer(product);
                    this.updateActiveFL(product);
                } else {
                    this.deleteActiveFL(product);
                    if (this.isCustomModelSelected(product)) {
                        this.updateCustomModel(product);
                    } else {
                        this.hideCustomModel(product);
                        this.updateWMSLayer(product);
                    }
                }
                this.updateFieldLines(onlyStyleChange);
            }
            this.checkColorscale(product.get('download').id);
        },

        hideWMSLayer: function (product) {
            var cesLayer = product._cesiumLayer;
            cesLayer.show = false;
            this.map.scene.imageryLayers.remove(cesLayer, false);
        },

        updateWMSLayer: function (product) {
            var parameters = product.get('parameters');
            var band = this.getSelectedVariable(parameters);
            var style = parameters[band].colorscale;
            var range = parameters[band].range;
            var height = product.get('height');
            var id = product.get('download').id;

            var cesLayer = product._cesiumLayer;
            cesLayer.imageryProvider.updateProperties('dim_bands', band);
            cesLayer.imageryProvider.updateProperties('dim_range', [range[0], range[1]].join(','));
            cesLayer.imageryProvider.updateProperties('elevation', height);

            cesLayer.imageryProvider.updateProperties(
                'dim_contours', product.get('contours') ? 1 : 0
            );
            if (style) {
                cesLayer.imageryProvider.updateProperties('styles', style);
            }

            if (product.get('model')) {
                cesLayer.imageryProvider.updateProperties(
                    'models', product.getModelExpression(id)
                );
            }

            if (product.get('visible')) {
                cesLayer.show = true;
                var index = this.map.scene.imageryLayers.indexOf(cesLayer);
                this.map.scene.imageryLayers.remove(cesLayer, false);
                this.map.scene.imageryLayers.add(cesLayer, index);
            }
        },

        onAnalyticsFilterChanged: function (filter) {
            console.log(filter);
        },


        onExportGeoJSON: function () {
            var geojsonstring = this.geojson.write(this.vectorLayer.features, true);
            var blob = new Blob([geojsonstring], {
                type: 'text/plain;charset=utf-8'
            });
            saveAs(blob, 'selection.geojson');
        },

        onGetGeoJSON: function () {
            return this.geojson.write(this.vectorLayer.features, true);
        },

        onGetMapExtent: function () {
            return this.getMapExtent();
        },

        getMapExtent: function () {
            var ellipsoid = this.map.scene.globe.ellipsoid;
            var c2 = new Cesium.Cartesian2(0, 0);
            var leftTop = this.map.scene.camera.pickEllipsoid(c2, ellipsoid);
            c2 = new Cesium.Cartesian2(this.map.scene.canvas.width, this.map.scene.canvas.height);
            var rightDown = this.map.scene.camera.pickEllipsoid(c2, ellipsoid);

            if (leftTop != null && rightDown != null) { //ignore jslint
                leftTop = ellipsoid.cartesianToCartographic(leftTop);
                rightDown = ellipsoid.cartesianToCartographic(rightDown);
                return {
                    left: Cesium.Math.toDegrees(leftTop.longitude),
                    bottom: Cesium.Math.toDegrees(rightDown.latitude),
                    right: Cesium.Math.toDegrees(rightDown.longitude),
                    top: Cesium.Math.toDegrees(leftTop.latitude)
                };
            } else {
                //The sky is visible in 3D
                // TODO: Not sure what the best way to calculate the extent is when sky/space is visible.
                //       This method is just an approximation, not actually correct
                // Try to get center point
                var center = new Cesium.Cartesian2(this.map.scene.canvas.width / 2, this.map.scene.canvas.height / 2);
                center = this.map.scene.camera.pickEllipsoid(center, ellipsoid);
                if (center && center !== null) {
                    center = ellipsoid.cartesianToCartographic(center);
                    return {
                        left: Cesium.Math.toDegrees(center.longitude) - 90,
                        bottom: Cesium.Math.toDegrees(center.latitude) - 45,
                        right: Cesium.Math.toDegrees(center.longitude) + 90,
                        top: Cesium.Math.toDegrees(center.latitude) + 45
                    };
                } else {
                    // If everything fails assume whole world is visible which is wrong
                    return {left: -180, bottom: -90, right: 180, top: 90};
                }
            }
        },

        renderSVG: function (svg, width, height) {
            $('#imagerenderercanvas').attr('width', width);
            $('#imagerenderercanvas').attr('height', height);
            var c = document.querySelector('#imagerenderercanvas');
            var ctx = c.getContext('2d');
            // Clear the canvas
            ctx.clearRect(0, 0, width, height);
            ctx.drawSvg(svg, 0, 0, height, width);
            return c.toDataURL('image/jpg');
        },

        createViewportQuad: function (img, x, y, width, height) {
            var newmat = new Cesium.Material.fromType('Image', {
                image: img,
                color: new Cesium.Color(1, 1, 1, 1),
            });
            return new Cesium.ViewportQuad(
                new Cesium.BoundingRectangle(x, y, width, height), newmat
            );
        },

        checkColorscale: function (pId) {
            var visible = true;
            var product = false;
            var indexDel;
            var margin = 20;
            var width = 300;
            var scalewidth = width - margin * 2;

            globals.products.each(function (p) {
                if (p.get('download').id === pId) {
                    product = p;
                }
            }, this);

            if (_.has(this.colorscales, pId)) {
                // remove object from cesium scene
                this.map.scene.primitives.remove(this.colorscales[pId].prim);
                this.map.scene.primitives.remove(this.colorscales[pId].csPrim);
                indexDel = this.colorscales[pId].index;
                delete this.colorscales[pId];
                this.removeColorscaleTooltipDiv(pId);

                // Modify all indices and related height of all colorscales
                // which are over deleted position

                _.each(this.colorscales, function (value, key, obj) {
                    var i = obj[key].index - 1;
                    if (i >= indexDel) {
                        var scaleImg = obj[key].prim.material.uniforms.image;
                        var csImg = obj[key].csPrim.material.uniforms.image;
                        this.map.scene.primitives.remove(obj[key].prim);
                        this.map.scene.primitives.remove(obj[key].csPrim);
                        obj[key].prim = this.map.scene.primitives.add(
                            this.createViewportQuad(scaleImg, 0, i * 55 + 5, width, 55)
                        );
                        obj[key].csPrim = this.map.scene.primitives.add(
                            this.createViewportQuad(csImg, 20, i * 55 + 42, scalewidth, 10)
                        );
                        obj[key].index = i;
                        // needed to refresh colorscale tooltip divs when products are added or removed
                        var productFromColorscale = _.find(globals.products.models, function (prod) {
                            return prod.get('download').id === key;
                        });
                        this.createModelColorscaleTooltipDiv(productFromColorscale, i);
                    }
                }, this);
            }

            if (product && product.get('views')[0].protocol === 'WPS' &&
                product.get('shc') === null) {
                visible = false;
            }

            if (product.get('timeSliderProtocol') === 'INDEX') {
                visible = false;
            }

            if (product && product.get('showColorscale') &&
                product.get('visible') && visible) {

                var options = product.get('parameters');

                if (options) {
                    var keys = _.keys(options);
                    var sel = false;

                    _.each(keys, function (key) {
                        if (options[key].selected) {
                            sel = key;
                        }
                    });

                    var rangeMin = product.get('parameters')[sel].range[0];
                    var rangeMax = product.get('parameters')[sel].range[1];
                    var uom = product.get('parameters')[sel].uom;
                    var style = product.get('parameters')[sel].colorscale;
                    var logscale = defaultFor(product.get('parameters')[sel].logarithmic, false);
                    var axisScale;


                    this.plot.setColorScale(style);
                    var colorscaleimage = this.plot.getColorScaleImage().toDataURL();

                    $('#svgcolorscalecontainer').remove();
                    var svgContainer = d3.select('body').append('svg')
                        .attr('width', 300)
                        .attr('height', 60)
                        .attr('id', 'svgcolorscalecontainer');

                    if (logscale) {
                        axisScale = d3.scale.log();
                    } else {
                        axisScale = d3.scale.linear();
                    }

                    axisScale.domain([rangeMin, rangeMax]);
                    axisScale.range([0, scalewidth]);

                    var xAxis = d3.svg.axis()
                        .scale(axisScale);

                    if (logscale) {
                        var numberFormat = d3.format(',f');
                        xAxis.tickFormat(function logFormat(d) {
                            var x = Math.log10(d) + 1e-6;
                            return Math.abs(x - Math.floor(x)) < 0.3 ? numberFormat(d) : '';
                        });

                    } else {
                        var step = Number(((rangeMax - rangeMin) / 5).toPrecision(3));
                        var ticks = d3.range(rangeMin, rangeMax + step, step);
                        xAxis.tickValues(ticks);
                        xAxis.tickFormat(d3.format('g'));
                    }

                    var g = svgContainer.append('g')
                        .attr('class', 'x axis')
                        .attr('transform', 'translate(' + [margin, 20] + ')')
                        .call(xAxis);

                    // Add layer info
                    var info;
                    if (product.get('model')) {
                        if (product.get('components').length === 1) {
                            info = product.getPrettyModelExpression(true);
                        } else {
                            info = product.get('download').id;
                        }
                        _.each(
                            {'\u2212': /&minus;/, '\u2026': /&hellip;/},
                            function (regex, newString) {
                                info = info.replace(regex, newString);
                            }
                        );
                    } else {
                        info = product.get('name');
                    }

                    info += ' - ' + sel;
                    if (uom) {
                        info += ' [' + uom + ']';
                    }

                    g.append('text')
                        .style('text-anchor', 'middle')
                        .attr('transform', 'translate(' + [scalewidth / 2, 30] + ')')
                        .attr('font-weight', 'bold')
                        .text(info);

                    svgContainer.selectAll('text')
                        .attr('stroke', 'none')
                        .attr('fill', 'black')
                        .attr('font-weight', 'bold');

                    svgContainer.selectAll('.tick').select('line')
                        .attr('stroke', 'black');

                    svgContainer.selectAll('.axis .domain')
                        .attr('stroke-width', '2')
                        .attr('stroke', '#000')
                        .attr('shape-rendering', 'crispEdges')
                        .attr('fill', 'none');

                    svgContainer.selectAll('.axis path')
                        .attr('stroke-width', '2')
                        .attr('shape-rendering', 'crispEdges')
                        .attr('stroke', '#000');

                    var svgHtml = d3.select('#svgcolorscalecontainer')
                        .attr('version', 1.1)
                        .attr('xmlns', 'http://www.w3.org/2000/svg')
                        .node().innerHTML;

                    var renderHeight = 55;
                    var renderWidth = width;

                    var index = Object.keys(this.colorscales).length;

                    var prim = this.map.scene.primitives.add(
                        this.createViewportQuad(
                            this.renderSVG(svgHtml, renderWidth, renderHeight),
                            0, index * 55 + 5, renderWidth, renderHeight
                        )
                    );
                    var csPrim = this.map.scene.primitives.add(
                        this.createViewportQuad(
                            colorscaleimage, 20, index * 55 + 42, scalewidth, 10
                        )
                    );

                    this.createModelColorscaleTooltipDiv(product, index);
                    this.colorscales[pId] = {
                        index: index,
                        prim: prim,
                        csPrim: csPrim
                    };

                    svgContainer.remove();
                }
            }
        },

        createModelColorscaleTooltipDiv: function (product, index) {
            var prodId = product.get('download').id;
            var elId = 'colorscale_label_' + prodId;
            this.removeColorscaleTooltipDiv(prodId);
            if (product.get('model') && product.get('components').length > 1 && product.get('showColorscale') && product.get('visible')) {
                var bottom = (57 * index) + parseInt($('.cesium-viewer').css('padding-bottom'), 10);
                this.$el.append('<div class="colorscaleLabel" id="' + elId + '" style="bottom:' + bottom + 'px;" title="' + product.getPrettyModelExpression(true) + '"></div>');
            }
        },

        removeColorscaleTooltipDiv: function (pId) {
            var id = 'colorscale_label_' + pId;
            $('#' + id).remove();
        },

        onSelectionActivated: function (arg) {
            this.selectionType = arg.selectionType;
            this.fillBboxForms();
            if (arg.active) {
                this.drawhelper.startDrawingRectangle({
                    callback: function (extent) {
                        var bbox = {
                            n: Cesium.Math.toDegrees(extent.north),
                            e: Cesium.Math.toDegrees(extent.east),
                            s: Cesium.Math.toDegrees(extent.south),
                            w: Cesium.Math.toDegrees(extent.west)
                        };
                        Communicator.mediator.trigger('selection:changed', bbox);
                        this.fillBboxForms();
                        $('.bboxEdit').addClass('hidden');
                    }.bind(this)
                });
            } else {
                //Communicator.mediator.trigger('selection:changed', null);
                this.drawhelper.stopDrawing();
                // It seems the drawhelper muted handlers reset to false and
                // it creates issues in cesium picking for some reason so
                // we deactivate them again
                this.drawhelper._handlersMuted = true;
            }
        },

        onSelectionChanged: function (bbox) {

            // It seems the drawhelper muted handlers reset to false and
            // it creates issues in cesium picking for some reason so
            // we deactivate them again
            this.drawhelper._handlersMuted = true;

            // Remove any possible selection and field lines (e.g.by tutorial)
            if (this.extentPrimitive) {
                this.map.entities.remove(this.extentPrimitive);
            }
            this.hideFieldLines();

            if (bbox) {
                this.bboxsel = [bbox.s, bbox.w, bbox.n, bbox.e];
                var rectangle = Cesium.Rectangle.fromDegrees(bbox.w, bbox.s, bbox.e, bbox.n);
                this.extentPrimitive = this.map.entities.add({
                    id: 'selectionrectangle',
                    rectangle: {
                        coordinates: rectangle,
                        fill: false,
                        outline: true,
                        outlineColor: Cesium.Color.BLUE,
                        outlineWidth: 2
                    }
                });
                this.updateFieldLines();
                $('#bb_selection').html('Clear Selection');

            } else {
                this.bboxsel = null;
                $('#bb_selection').html('Select Area');
            }

            // When custom SHC selected switch to WPS visualization.
            _.each(
                globals.products.filter(function (product) {
                    return product.get('model') && this.isCustomModelSelected(product);
                }, this),
                this.updateCustomModel, this
            );
        },

        updateFieldLines: function (onlyStyleChange) {
            if (typeof this.showFieldLinesDebounced === 'undefined') {
                this.showFieldLinesDebounced = _.debounce(function (onlyStyleChange) {
                    this.showFieldLines(onlyStyleChange);
                }, 2000);
            }
            this.hideFieldLinesLabel();
            if (this.activeFL.length > 0 && this.bboxsel) {
                this.showFieldLinesDebounced(onlyStyleChange);
            } else {
                this.hideFieldLines();
            }
        },

        showFieldLines: function (onlyStyleChange) {
            _.each(
                globals.products.filter(function (product) {
                    return this.activeFL.indexOf(product.get('download').id) !== -1;
                }, this),
                function (product) {
                    var name = product.get('name');
                    var parameters = product.get('parameters');
                    var variable = this.getSelectedVariable(parameters);
                    var style = parameters[variable].colorscale;
                    var range_min = parameters[variable].range[0];
                    var range_max = parameters[variable].range[1];
                    var log_scale = parameters[variable].logarithmic;
                    var time = meanDate(this.beginTime, this.endTime);
                    this.removeFLPrimitives(name);

                    if (variable !== 'Fieldlines') return;

                    if (product.getModelValidity().start > time || product.getModelValidity().end < time) return;
                    var options = {
                        model_ids: product.getModelExpression(product.get('download').id),
                        shc: product.getCustomShcIfSelected(),
                        time: getISODateTimeString(time),
                        bbox: [
                            this.bboxsel[0], this.bboxsel[1], this.bboxsel[2], this.bboxsel[3]
                        ].join(','),
                    };
                    if (onlyStyleChange && typeof this.FLStoredData[name] !== 'undefined') {
                        // do not send request to server if no new data needed
                        this.createFLPrimitives(this.FLStoredData[name], name, style, range_min, range_max, log_scale);
                    } else {
                        // send regular request
                        httpRequest.asyncHttpRequest({
                            context: this,
                            type: 'POST',
                            url: product.get('views')[0].urls[0],
                            data: tmplGetFieldLines(options),
                            responseType: 'arraybuffer',
                            parse: function (data, xhr) {
                                return msgpack.decode(new Uint8Array(data));
                            },
                            success: function (data, xhr) {
                                this.createFLPrimitives(data, name, style, range_min, range_max, log_scale);
                                this.FLStoredData[name] = data;
                            },
                            error: function (xhr) {
                                if (xhr.responseText === "") {return;}
                                var error_text = xhr.responseText.match("<ows:ExceptionText>(.*)</ows:ExceptionText>");
                                if (error_text && error_text.length > 1) {
                                    error_text = error_text[1];
                                } else {
                                    error_text = 'Please contact feedback@vires.services if issue persists.';
                                }
                                showMessage('danger', ('Problem retrieving data: ' + error_text), 35);
                            }
                        });
                    }
                }, this
            );
        },

        hideFieldLines: function () {
            _.each(_.keys(this.FLCollection), this.removeFLPrimitives, this);
            this.hideFieldLinesLabel();
        },

        getSelectedVariable: function (parameters) {
            if (!parameters) return;
            for (var key in parameters) {
                if (parameters[key].selected) {
                    return key;
                }
            }
        },

        updateActiveFL: function (product) {
            if (product.get('visible')) {
                this.insertActiveFL(product);
            } else {
                this.deleteActiveFL(product);
            }
        },

        insertActiveFL: function (product) {
            var id = product.get('download').id;
            var index = this.activeFL.indexOf(id);
            if (index === -1) {
                this.activeFL.push(id);
            }
        },

        deleteActiveFL: function (product) {
            var id = product.get('download').id;
            var index = this.activeFL.indexOf(id);
            if (index !== -1) {
                this.activeFL.splice(index, 1);
            }
        },

        onFieldlinesChanged: function () {
            this.updateFieldLines();
        },

        removeFLPrimitives: function (name) {
            if (this.FLCollection.hasOwnProperty(name)) {
                this.map.scene.primitives.remove(this.FLCollection[name]);
                delete this.FLCollection[name];
                delete this.FLData[name];
            }
        },

        createFLPrimitives: function (data, name, style, range_min, range_max, log_scale) {
            this.removeFLPrimitives(name);
            var instances = _.chain(data.fieldlines)
                .map(function (fieldlines, modelId) {
                    return _.map(fieldlines, function (fieldline, index) {
                        // Note that all coordinates are in Geocentric Spherical CS,
                        // i.e., [latitude, longitude, radius]
                        // The angles are in degrees and lengths in meters.
                        var positions = _.map(fieldline.coordinates, function (coords) {
                            return Cesium.Cartesian3.fromDegrees(
                                coords[1], coords[0], coords[2], GEOCENTRIC_SPHERICAL
                            );
                        });
                        // compute colors from values using plotty plot
                        this.plot.setColorScale(style);
                        if (log_scale) {
                            this.plot.setDomain([Math.log10(range_min), Math.log10(range_max)]);
                            var colors = _.map(fieldline.values, function (value) {
                                var color = this.plot.getColor(Math.log10(value));
                                return Cesium.Color.fromBytes(color[0], color[1], color[2], 255);
                            }.bind(this));
                        } else {
                            this.plot.setDomain([range_min, range_max]);
                            var colors = _.map(fieldline.values, function (value) {
                                var color = this.plot.getColor(value);
                                return Cesium.Color.fromBytes(color[0], color[1], color[2], 255);
                            }.bind(this));
                        }

                        // save data to get fieldline info later
                        if (typeof this.FLData[name] === 'undefined') {
                            this.FLData[name] = {};
                        }
                        var id = 'vec_line_fl_' + modelId + '_' + index;
                        this.FLData[name][id] = {
                            'apex_point': fieldline.apex_point,
                            'apex_height': fieldline.apex_height,
                            'ground_points': fieldline.ground_points,
                        };

                        return new Cesium.GeometryInstance({
                            id: id,
                            geometry: new Cesium.PolylineGeometry({
                                width: 2.0,
                                vertexFormat: Cesium.PolylineColorAppearance.VERTEX_FORMAT,
                                colorsPerVertex: true,
                                positions: positions,
                                colors: colors,
                            })
                        });
                    }, this);
                }, this)
                .flatten()
                .value();

            this.FLCollection[name] = new Cesium.Primitive({
                geometryInstances: instances,
                appearance: new Cesium.PolylineColorAppearance()
            });
            this.map.scene.primitives.add(this.FLCollection[name]);
        },

        onFieldlineClicked: function (fieldline, clickPosition) {
            var FLProduct = _.find(Object.keys(this.FLData), function (item) {
                // find product where searched id exists as value
                return this.FLData[item][fieldline.id];
            }.bind(this));
            if (typeof FLProduct !== 'undefined') {
                var fl_data = this.FLData[FLProduct][fieldline.id];
                // prepare template data
                var apex = {
                    lat: fl_data['apex_point'][0].toFixed(3),
                    lon: fl_data['apex_point'][1].toFixed(3),
                    height: (fl_data['apex_height'] / 1000).toFixed(1),
                };
                var ground_points = [{
                    lat: fl_data['ground_points'][0][0].toFixed(3),
                    lon: fl_data['ground_points'][0][1].toFixed(3),
                }, {
                    lat: fl_data['ground_points'][1][0].toFixed(3),
                    lon: fl_data['ground_points'][1][1].toFixed(3),
                }];
                var options = {
                    ground_points: ground_points,
                    apex: apex,
                };

                $('#fieldlines_label').html(tmplFieldLinesLabel(options));
                $('#fieldlines_label').removeClass('hidden');
                $('#fieldlines_label').offset({left: clickPosition.x + 18, top: clickPosition.y});
                $('.close-fieldline-label').off('click');
                $('.close-fieldline-label').on('click', this.hideFieldLinesLabel.bind(this));
                // highlight points
                this.FLbillboards.removeAll();
                this.highlightFieldLinesPoints([fl_data['apex_point'], fl_data['ground_points'][0], fl_data['ground_points'][1]]);
            }
        },

        hideFieldLinesLabel: function () {
            $('#fieldlines_label').addClass('hidden');
            this.FLbillboards.removeAll();
        },

        onHighlightPoint: function (coords, fieldlines_highlight) {
            // either highlight single point or point on a fieldline
            if (!fieldlines_highlight) {
                this.billboards.removeAll();
            }
            var canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 32;
            var context2D = canvas.getContext('2d');
            context2D.beginPath();
            context2D.arc(16, 16, 12, 0, Cesium.Math.TWO_PI, true);
            context2D.closePath();
            context2D.strokeStyle = 'rgb(255, 255, 255)';
            context2D.lineWidth = 3;
            context2D.stroke();

            context2D.beginPath();
            context2D.arc(16, 16, 9, 0, Cesium.Math.TWO_PI, true);
            context2D.closePath();
            context2D.strokeStyle = 'rgb(0, 0, 0)';
            context2D.lineWidth = 3;
            context2D.stroke();
            var canvasPoint = {
                imageId: 'custom canvas point',
                image: canvas,
                position: Cesium.Cartesian3.fromDegrees(coords[1], coords[0], parseInt(coords[2] - 6384100)),
                radius: coords[2],
                scale: 1
            };
            if (!fieldlines_highlight) {
                this.billboards.add(canvasPoint);
            } else {
                this.FLbillboards.add(canvasPoint);
            }
        },

        highlightFieldLinesPoints: function (fieldlines) {
            // accepts a list of fieldline points to be highlighted
            _.each(fieldlines, function (item) {
                this.onHighlightPoint([item[0], item[1], item[2]], true);
            }.bind(this));
        },

        onRemoveHighlights: function () {
            this.billboards.removeAll();
        },

        onTimeChange: function (time) {
            var string = getISODateTimeString(time.start) + '/' +
                         getISODateTimeString(time.end);
            this.beginTime = time.start;
            this.endTime = time.end;
            globals.products.each(function (product) {

                if (product.get('timeSlider')) {
                    // Check if product contains shc file, if yes we need
                    // to switch to wps for visualization
                    if (product.get('model') && this.isCustomModelSelected(product)) {
                        this.updateCustomModel(product);
                    } else {
                        product.set('time', string);
                        var cesLayer = product._cesiumLayer;
                        if (cesLayer &&
                           (typeof cesLayer.imageryProvider.updateProperties === 'function')) {
                            cesLayer.imageryProvider.updateProperties('time', string);
                            if (cesLayer.show) {
                                var index = this.map.scene.imageryLayers.indexOf(cesLayer);
                                this.map.scene.imageryLayers.remove(cesLayer, false);
                                this.map.scene.imageryLayers.add(cesLayer, index);
                            }
                        }
                    }
                }
            }, this);
            this.updateFieldLines();
        },

        onSetExtent: function (bbox) {
            //this.map.zoomToExtent(bbox);
            /*this.map.scene.camera.flyToRectangle({
              destination: Cesium.Rectangle.fromDegrees(bbox[0], bbox[1], bbox[2], bbox[3])
            });*/
        },

        onChangeZoom: function (zoom) {
            if (zoom < 0) {
                this.map.scene.camera.zoomOut(Math.abs(zoom));
            } else {
                this.map.scene.camera.zoomIn(Math.abs(zoom));
            }
        },


        onClose: function () {
            this.isClosed = true;
        },

        isModelCompatible: function (model) {
            var protocol = model.get('view').protocol;
            if (protocol === 'WMS' || protocol === 'WMTS') {
                return true;
            }
            return false;
        },

        isEventListenedTo: function (eventName) {
            return !!this._events[eventName];
        },

        onLoadImage: function (url, selection_bounds) {
        },

        onSaveImage: function () {
            this.map.canvas.toBlob(function (blob) {
                saveAs(blob, 'VirES_Services_Screenshot.jpg');
            }, 'image/jpeg', 1);
        },

        onClearImage: function () {
            if (this.diffOverlay) {
                this.map.removeLayer(this.diffOverlay);
                this.diffOverlay = null;
            }
        },


        handleTick: function (clock) {
            // TODO: Cesium does not provide a method to know when the camera has stopped,
            //       this approach is not ideal, when the movement mantains inertia difference
            //       values are very low and there are comparison errors.
            var c = this.map.scene.camera;
            var th = [10000, 10000, 10000];
            // If current mode is either Columbus or Scene2D lower threshold
            if (this.map.scene.mode === 1 || this.map.scene.mode === 2) {
                th = [0, 0, 0];
            }
            if (!this.cameraIsMoving) {
                if (Math.abs(this.cameraLastPosition.x - c.position.x) > th[0] &&
                    Math.abs(this.cameraLastPosition.y - c.position.y) > th[1] &&
                    Math.abs(this.cameraLastPosition.z - c.position.z) >= th[2]) {
                    this.cameraIsMoving = true;
                }
            } else {
                if (Math.abs(this.cameraLastPosition.x - c.position.x) <= th[0] &&
                    Math.abs(this.cameraLastPosition.y - c.position.y) <= th[1] &&
                    Math.abs(this.cameraLastPosition.z - c.position.z) <= th[2]) {
                    this.cameraIsMoving = false;
                    Communicator.mediator.trigger('map:position:change', this.getMapExtent());
                    localStorage.setItem('cameraPosition', JSON.stringify({
                        position: [c.position.x, c.position.y, c.position.z],
                        direction: [c.direction.x, c.direction.y, c.direction.z],
                        up: [c.up.x, c.up.y, c.up.z],
                        right: [c.right.x, c.right.y, c.right.z]
                    }));
                } else {
                    this.cameraLastPosition.x = c.position.x;
                    this.cameraLastPosition.y = c.position.y;
                    this.cameraLastPosition.z = c.position.z;
                }
            }
        },

        wrapBbox: function (box) {
            // accepts bbox object{n:float, s:float, w:float, e:float}
            // returns bbox with numeric values fit to (-180, 180, -90, 90), performing switching n->s and w->e if necessary
            // cant solve over-dateline jumps
            var bbox = _.clone(box);
            // switch north and south if necessary
            if (bbox.n < bbox.s) {
                var tempS = bbox.s;
                bbox.s = bbox.n;
                bbox.n = tempS;
            }
            // fits to lat boundaries
            bbox.n = Math.min(bbox.n, 90);
            bbox.s = Math.max(bbox.s, -90);
            // fits to lon max boundaries if difference greater than 360
            if (bbox.e - bbox.w > 360) {
                bbox.w = -180;
                bbox.e = 180;
            }
            // fits lon boundaries to -180,180 range
            _.each(bbox, function (coord, key, obj) {
                while (coord > 180) {
                    coord -= 360;
                    obj[key] = coord;
                }
                while (coord < -180) {
                    coord += 360;
                    obj[key] = coord;
                }
            });
            // switch east and west if necessary
            if (bbox.e < bbox.w) {
                var tempE = bbox.e;
                bbox.e = bbox.w;
                bbox.w = tempE;
            }
            return bbox;
        },

        submitCoordinateForms: function () {
            // coordinate form validation and event emitting
            var w = parseFloat($('#bboxWestForm').val().replace(',', '.'));
            var e = parseFloat($('#bboxEastForm').val().replace(',', '.'));
            var n = parseFloat($('#bboxNorthForm').val().replace(',', '.'));
            var s = parseFloat($('#bboxSouthForm').val().replace(',', '.'));
            if (!isNaN(w) && !isNaN(e) && !isNaN(n) && !isNaN(s) && w !== e && n !== s) {
                // valid values inserted
                var bbox = {
                    "w": w,
                    "e": e,
                    "n": n,
                    "s": s,
                };
                // fix bbox if necessary
                var bboxFixed = this.wrapBbox(bbox);

                $("#bboxEditConfirm").removeClass("wrongBboxFormInput");
                $('.bboxEdit').addClass('hidden');
                Communicator.mediator.trigger('selection:changed', bboxFixed);
                Communicator.mediator.trigger('selection:activated', {
                    id: 'bboxSelection',
                    active: false,
                    selectionType: 'single'
                });
            } else {
                // invalid input
                $("#bboxEditConfirm").addClass("wrongBboxFormInput");
            }
        },

        cameraCustomZoomOnWheel: function (e) {
            var camera = this.map.scene.camera;
            var cameraHeight = Cesium.Ellipsoid.WGS84.cartesianToCartographic(camera.position).height;
            // make camera zoom depend on height
            var moveRate = cameraHeight / 10.0;
            if (e.originalEvent.deltaY < 0) {
                // scrolling up
                camera.moveForward(moveRate);
            }
            if (e.originalEvent.deltaY > 0) {
                camera.moveBackward(moveRate);
            }
        },

        polarViewZoom: function () {
            $(".poleButton").removeClass("viewActive");
            $("#poleViewButton").addClass("viewActive");
            this.map.scene.screenSpaceCameraController.enableRotate = false;
            this.map.scene.screenSpaceCameraController.enableTranslate = false;
            this.map.scene.screenSpaceCameraController.enableTilt = false;
            this.map.scene.screenSpaceCameraController.enableLook = false;
            this.map.scene.screenSpaceCameraController.enableZoom = false;

            $('.cesium-widget').off('wheel');
            $('.cesium-widget').on('wheel', function (e) {
                this.cameraCustomZoomOnWheel(e);
            }.bind(this));
        },

        globalViewZoomReset: function () {
            $("#poleViewButton").text('Globe View');
            $(".poleButton").removeClass("viewActive");
            $("#poleViewButton").removeClass("viewActive");
            this.map.scene.screenSpaceCameraController.enableRotate = true;
            this.map.scene.screenSpaceCameraController.enableTranslate = true;
            this.map.scene.screenSpaceCameraController.enableTilt = true;
            this.map.scene.screenSpaceCameraController.enableLook = true;
            this.map.scene.screenSpaceCameraController.enableZoom = true;
            $('.cesium-widget').off('wheel');
        },

        bindPolarButtons: function () {
            $('.poleButton').off('click');
            // magnetic poles hardcoded as were in 1.1.2015 (igrf)
            $(".magN").click(function () {
                this.map.scene.camera.flyTo({
                    destination: Cesium.Cartesian3.fromDegrees(-84.551, 83.075, 10000000),
                    orientation: {
                        direction: new Cesium.Cartesian3(-0.011449873133578228, 0.12003352097560159, -0.9927038099289358),
                        up: new Cesium.Cartesian3(-0.2418134773341136, 0.9629699323710552, 0.11922731033143948)
                    },
                    complete: function () {
                        this.polarViewZoom();
                        $('#poleViewButton').text('Mag. North');
                        $(".magN").addClass("viewActive");
                    }.bind(this)
                });
            }.bind(this));

            // magnetic poles hardcoded as were in 1.1.2015 (igrf)
            $(".magS").click(function () {
                this.map.scene.camera.flyTo({
                    destination: Cesium.Cartesian3.fromDegrees(125.738, -74.383, 10000000),
                    orientation: {
                        direction: new Cesium.Cartesian3(0.1572357407963758, -0.21851202199924571, 0.963083287186532),
                        up: new Cesium.Cartesian3(0.25309094759697687, -0.9337284667987544, -0.25317212037290326)
                    },
                    complete: function () {
                        this.polarViewZoom();
                        $('#poleViewButton').text('Mag. South');
                        $(".magS").addClass("viewActive");
                    }.bind(this)
                });
            }.bind(this));

            $(".geoN").click(function () {
                this.map.scene.camera.flyTo({
                    destination: Cesium.Cartesian3.fromDegrees(0, 90, 10000000),
                    complete: function () {
                        this.polarViewZoom();
                        $('#poleViewButton').text('Geo. North');
                        $(".geoN").addClass("viewActive");
                    }.bind(this)
                });
            }.bind(this));

            $(".geoS").click(function () {
                this.map.scene.camera.flyTo({
                    destination: Cesium.Cartesian3.fromDegrees(0, -90, 10000000),
                    complete: function () {
                        this.polarViewZoom();
                        $('#poleViewButton').text('Geo. South');
                        $(".geoS").addClass("viewActive");
                    }.bind(this)
                });
            }.bind(this));

            $("#resetCameraView").click(function () {
                this.map.scene.camera.flyTo({
                    destination: Cesium.Rectangle.fromDegrees(-20.0, -15.0, 45.0, 60.0),
                    complete: this.globalViewZoomReset.bind(this)
                });
            }.bind(this));
        },

        toggleDebug: function () {
            this.map.scene.debugShowFramesPerSecond = !this.map.scene.debugShowFramesPerSecond;
        }
    });
    return CesiumView;
});
