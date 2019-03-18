

define([
    'backbone.marionette',
    'communicator',
    'app',
    'models/MapModel',
    'globals',
    'papaparse',
    'hbs!tmpl/wps_eval_composed_model',
    'hbs!tmpl/wps_get_field_lines',
    'cesium/Cesium',
    'drawhelper',
    'FileSaver',
    'plotty'
], function( Marionette, Communicator, App, MapModel, globals, Papa,
             tmplEvalModel, tmplGetFieldLines) {
    'use strict';
    var CesiumView = Marionette.View.extend({
        model: new MapModel.MapModel(),

        initialize: function(options) {
            this.map = undefined;
            this.isClosed = true;
            this.tileManager = options.tileManager;
            this.selectionType = null;
            this.overlayIndex = 99;
            this.diffimageIndex = this.overlayIndex-10;
            this.diffOverlay = null;
            this.overlayLayers = [];
            this.overlayOffset = 100;
            this.cameraIsMoving = false;
            this.cameraLastPosition = null;
            this.billboards = null;
            this.activeFL = [];
            this.featuresCollection = {};
            this.FLCollection = {};
            this.bboxsel = null;
            this.extentPrimitive = null;
            this.activeModels = [];
            this.activeCollections = [];
            this.differenceImage = null;
            this.dataFilters = {};
            this.colorscales = {};
            this.beginTime = null;
            this.endTime = null;
            this.plot = null;

            plotty.addColorScale('redblue', ['#ff0000', '#0000ff'], [0, 1]);
            plotty.addColorScale('coolwarm', 
                ['#0000ff','#ffffff', '#ff0000'],
                [0, 0.5, 1]
            );
            plotty.addColorScale('diverging_1',
                ['#400040','#3b004d','#36005b','#320068','#2d0076','#290084',
                 '#240091','#20009f','#1b00ad','#1600ba','#1200c8','#0d00d6',
                 '#0900e3','#0400f1','#0000ff','#0217ff','#042eff','#0645ff',
                 '#095cff','#0b73ff','#0d8bff','#10a2ff','#12b9ff','#14d0ff',
                 '#17e7ff','#19ffff','#3fffff','#66ffff','#8cffff','#b2ffff',
                 '#d8ffff','#ffffff','#ffffd4','#ffffaa','#ffff7f','#ffff54',
                 '#ffff2a','#ffff00','#ffed00','#ffdd00','#ffcc00','#ffba00',
                 '#ffaa00','#ff9900','#ff8700','#ff7700','#ff6600','#ff5400',
                 '#ff4400','#ff3300','#ff2100','#ff1100','#ff0000','#ff0017',
                 '#ff002e','#ff0045','#ff005c','#ff0073','#ff008b','#ff00a2',
                 '#ff00b9','#ff00d0','#ff00e7','#ff00ff'],
                 [0.0,0.01587301587,0.03174603174,0.04761904761,0.06349206348,
                  0.07936507935,0.09523809522,0.11111111109,0.12698412696,
                  0.14285714283,0.15873015870,0.17460317457,0.19047619044,
                  0.20634920631,0.22222222218,0.23809523805,0.25396825392,
                  0.26984126979,0.28571428566,0.30158730153,0.31746031740,
                  0.33333333327,0.34920634914,0.36507936501,0.38095238088,
                  0.39682539675,0.41269841262,0.42857142849,0.44444444436,
                  0.46031746023,0.47619047610,0.49206349197,0.50793650784,
                  0.52380952371,0.53968253958,0.55555555545,0.57142857132,
                  0.58730158719,0.60317460306,0.61904761893,0.63492063480,
                  0.65079365067,0.66666666654,0.68253968241,0.69841269828,
                  0.71428571415,0.73015873002,0.74603174589,0.76190476176,
                  0.77777777763,0.79365079350,0.80952380937,0.82539682524,
                  0.84126984111,0.85714285698,0.87301587285,0.88888888872,
                  0.90476190459,0.92063492046,0.93650793633,0.95238095220,
                  0.96825396807,0.98412698394,1]
            );
            plotty.addColorScale('diverging_2',
                ['#000000', '#030aff', '#204aff', '#3c8aff', '#77c4ff',
                 '#f0ffff', '#f0ffff', '#f2ff7f', '#ffff00', '#ff831e',
                 '#ff083d', '#ff00ff'],
                [0, 0.0000000001, 0.1, 0.2, 0.3333, 0.4666, 0.5333, 0.6666,
                 0.8, 0.9, 0.999999999999, 1]
            );
            plotty.addColorScale('blackwhite', ['#000000', '#ffffff'], [0, 1]);

            plotty.addColorScale('ylgnbu', 
                ["#081d58","#253494","#225ea8","#1d91c0","#41b6c4","#7fcdbb","#c7e9b4","#edf8d9","#ffffd9"],
                [1,0.875,0.75,0.625,0.5,0.375,0.25,0.125,0]
            );

            plotty.addColorScale('ylorrd', 
                ["#800026","#bd0026","#e31a1c","#fc4e2a","#fd8d3c","#feb24c","#fed976","#ffeda0","#ffffcc"],
                [1,0.875,0.75,0.625,0.5,0.375,0.25,0.125,0]
            );

            this.connectDataEvents();
        },

        createMap: function() {

            // Problem arose in some browsers where aspect ratio was kept not adapting 
            // to height; Added height style attribute to 100% to solve problem
            this.$el.attr('style','height:100%;');

            // TODO: We dont use bing maps layer, but it still reports use of default key in console.
            // For now we just set it to something else just in case.
            Cesium.BingMapsApi.defaultKey = 'NOTHING';
            Cesium.Camera.DEFAULT_VIEW_RECTANGLE = Cesium.Rectangle.fromDegrees(0.0, -10.0, 30.0, 55.0);

            Cesium.WebMapServiceImageryProvider.prototype.updateProperties = function(property, value) {
                property = '&'+property+'=';
                value = ''+value;
                var i = _.indexOf(this._tileProvider._urlParts, property);
                if (i>=0){
                    this._tileProvider._urlParts[i+1] = encodeURIComponent(value);
                }else{
                    this._tileProvider._urlParts.push(property);
                    this._tileProvider._urlParts.push(encodeURIComponent(value));
                }
            };

            this.$el.append('<div id="coordinates_label"></div>');
            this.$el.append('<div id="cesium_attribution"></div>');
            this.$el.append('<div id="cesium_custom_attribution"></div>');
            $('#cesium_custom_attribution').append(
                '<div style="float:left"><a href="http://cesiumjs.org" target="_blank">Cesium</a>'+
                '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>'
            );

            this.$el.append('<div type="button" class="btn btn-success darkbutton" id="cesium_save">Save as Image</div>');
            this.$el.append('<div type="button" class="btn btn-success darkbutton"  id="bb_selection">Select Area</div>');

            this.$el.append('<div id="poleViewDiv"></div>')
            $('#poleViewDiv').append('<button class="btn btn-success darkbutton dropdown-toggle" id="poleViewButton" data-toggle="dropdown">Globe View</button>');
            $('#poleViewDiv').append('<ul id="poleViewUl" class="dropdown-menu"></ul>');
            $('#poleViewUl').append('<li><button class="btn btn-success darkbutton magN poleButton">Mag N</button></li>');
            $('#poleViewUl').append('<li><button class="btn btn-success darkbutton magS poleButton">Mag S</button></li>');
            $('#poleViewUl').append('<li><button class="btn btn-success darkbutton geoN poleButton">Geo N</button></li>');
            $('#poleViewUl').append('<li><button class="btn btn-success darkbutton geoS poleButton">Geo S</button></li>');
            $('#poleViewUl').append('<li><button class="btn btn-success darkbutton" id="resetCameraView">Reset Cam</button></li>');

            this.bindPolarButtons();

            this.$el.append('<input type="text" class="bboxEdit hidden"  id="bboxWestForm" placeholder="West">');
            this.$el.append('<input type="text" class="bboxEdit hidden"  id="bboxEastForm" placeholder="East">');
            this.$el.append('<input type="text" class="bboxEdit hidden"  id="bboxNorthForm" placeholder="North">');
            this.$el.append('<input type="text" class="bboxEdit hidden"  id="bboxSouthForm" placeholder="South">');
            this.fillBboxForms();
            this.$el.append('<input type="button" class="bboxEdit hidden"  id="bboxEditConfirm" value="✔">');
            // hide cesium tooltip on hover over the forms
            $(".bboxEdit").hover(function(){
                $(".twipsy").addClass("hidden");
              },function(){
                $(".twipsy").removeClass("hidden");
            })
            $("#bboxEditConfirm").click(this.submitCoordinateForms.bind(this));
            $(".bboxEdit").keypress(function(evt){
                // confirm forms on enter too
                if (evt.keyCode === 13){
                    this.submitCoordinateForms();
                }
            }.bind(this));

            var layer;

            this.colors = globals.objects.get('color');

            if (this.beginTime === null || this.endTime === null){
                var selTime = Communicator.reqres.request('get:time');
                this.beginTime = selTime.start;
                this.endTime = selTime.end;
            }

            var baseLayers = [];
            var initialLayer = null;
            globals.baseLayers.each(function(baselayer) {
                var layer = this.createLayer(baselayer);
                baseLayers.push(layer);
                if (baselayer.get('visible')){
                    initialLayer = layer;
                }
            }, this);

            var clock = new Cesium.Clock({
               startTime : Cesium.JulianDate.fromIso8601('2014-01-01'),
               currentTime : Cesium.JulianDate.fromIso8601('2014-01-02'),
               stopTime : Cesium.JulianDate.fromIso8601('2014-01-03'),
               clockRange : Cesium.ClockRange.LOOP_STOP,
               clockStep : Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER,
               canAnimate: false,
               shouldAnimate: false
            });

            if (initialLayer){
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
                    terrainProvider : new Cesium.CesiumTerrainProvider({
                        url : '//dem.maps.eox.at/'
                    }),
                    creditContainer: 'cesium_attribution',
                    contextOptions: {webgl: {preserveDrawingBuffer: true}},
                    clock: clock
                };
                //COLUMBUS_VIEW SCENE2D SCENE3D
                if(localStorage.getItem('sceneMode') !== null){
                    options.sceneMode = Number(localStorage.getItem('sceneMode'));
                    if (options.sceneMode !== 3){
                        $('#poleViewDiv').addClass("hidden");
                    }
                }
                this.map = new Cesium.Viewer(this.el, options);
                var initialCesiumLayer = this.map.imageryLayers.get(0);
            }

            if(localStorage.getItem('cameraPosition') !== null){
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

            this.map.scene.morphStart.addEventListener(function(){
                this.globalViewZoomReset();
            }.bind(this));

            this.map.scene.morphComplete.addEventListener(function(){
                // change of mode event handler
                if (this.map._sceneModePicker.viewModel.sceneMode !== 3){
                    $('#poleViewDiv').addClass("hidden");
                } else{
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
            if(this.map.scene.hasOwnProperty('fog')){
                this.map.scene.fog.enabled = false;  
            }

            // Remove gazetteer field
            $('.cesium-viewer-geocoderContainer').remove();

            // Show Wireframe (Debug help)
            //this.map.scene.globe._surface._tileProvider._debug.wireframe = true;

            var handler = new Cesium.ScreenSpaceEventHandler(
                this.map.scene.canvas
            );
            handler.setInputAction(function() {
                //hide the selectionIndicator
                this.map.selectionIndicator.viewModel.selectionIndicatorElement.style.visibility = 'hidden'; 
            }.bind(this), Cesium.ScreenSpaceEventType.LEFT_CLICK);

            handler.setInputAction(function(movement) {
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
                        'Lat: ' + lat.toFixed(4) + '</br>Lon: '+lon.toFixed(4)
                    );
                    // prefill coordinates in bbox edit forms when user already clicked on map to draw a rectangle
                    if ($('#bb_selection').text() === "Deactivate"){
                        if ($('.twipsy-inner p').length === 2){
                            // could not find a way to hook up on events of external cesium drawing plugin, so watching for when a new tooltip appears
                            if (this.bboxEdit === undefined){
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
                globals.baseLayers.each(function(baselayer) {
                    if(initialLayer._layer === baselayer.get('views')[0].id){
                        baselayer.set('ces_layer', initialCesiumLayer);
                    }else{
                        if(baseLayers[i]._layer === baselayer.get('views')[0].id){
                            var imagerylayer = this.map.scene.imageryLayers.addImageryProvider(baseLayers[i]);
                            imagerylayer.show = baselayer.get('visible');
                            baselayer.set('ces_layer', imagerylayer);
                        }
                    }
                }, this);
            }

            // Go through all products and add them to the map
            _.each(globals.products.last(globals.products.length).reverse(), function(product){
                var layer = this.createLayer(product);
                if (layer) {
                    var imagerylayer = this.map.scene.imageryLayers.addImageryProvider(layer);
                    product.set('ces_layer', imagerylayer);
                    product.set('backupLayer', imagerylayer);

                    if(product.get('download').id === 'Magnetic_Model'){
                        if(this.checkComposedForSHC(product)){
                            imagerylayer.show = false;
                        } else {
                            imagerylayer.show = product.get('visible');
                        }
                    } else {
                        imagerylayer.show = product.get('visible');
                    }

                    imagerylayer.alpha = product.get('opacity');

                    // If product protocol is not WMS or WMTS they are
                    // shown differently so dont activate 'dummy' layers
                    if(product.get('views')[0].protocol !== 'WMS' &&
                       product.get('views')[0].protocol !== 'WMTS'){
                        imagerylayer.show = false;
                    }
                    // If product is model and active parameters is Fieldline 
                    // do not activate dummy layer and check for fieldlines
                    if(product.get('model')){
                        // Find active key
                        var active;
                        var params = product.get('parameters');
                        for (var key in params) {
                            if (params[key].selected) {
                                active = key;
                            }
                        }
                        if (active === 'Fieldlines'){
                            imagerylayer.show = false;
                        }

                        // Check if model is set to show difference
                        if(product.get('differenceTo') !== null){
                            imagerylayer.show = false;
                            /*imagerylayer.show = false;
                            var refProd = globals.products.filter(function(p){
                                return p.get('download').id === product.get('differenceTo');
                            });
                            this.checkModelDifference(product, refProd[0]);*/
                        }
                    }
                }
            }, this);

            // Go through all overlays and add them to the map
            globals.overlays.each(function(overlay){
                var layer = this.createLayer(overlay);
                if (layer) {
                    var imagerylayer = this.map.scene.imageryLayers.addImageryProvider(layer);
                    imagerylayer.show = overlay.get('visible');
                    overlay.set('ces_layer', imagerylayer);
                }
            }, this);


            this.map.scene.morphComplete.addEventListener(function (){
                localStorage.setItem('sceneMode', this.map.scene.mode);
                var c = this.map.scene.camera;
                localStorage.setItem('cameraPosition', 
                    JSON.stringify({
                        position: [c.position.x, c.position.y,c.position.z],
                        direction: [c.direction.x, c.direction.y,c.direction.z],
                        up: [c.up.x, c.up.y,c.up.z],
                        right: [c.right.x, c.right.y,c.right.z]
                    })
                );
            }, this);
        }, // END of createMap

        onShow: function() {
            if (!this.map) {
                this.createMap();
            }

            // Check for possible already available selection
            if(localStorage.getItem('areaSelection') !== null){
                var bbox = JSON.parse(localStorage.getItem('areaSelection'));
                if(bbox){
                    this.bboxsel = [bbox.s, bbox.w, bbox.n, bbox.e ];
                }
            }

            if(this.navigationhelp){
                this.navigationhelp.destroy();
                this.navigationhelp = new Cesium.NavigationHelpButton({
                    container: $('.cesium-viewer-toolbar')[0]
                });
            } 
            this.plot = new plotty.plot({});
            this.plot.setClamp(true, true);
            this.isClosed = false;

            $('#cesium_save').on('click', this.onSaveImage.bind(this));

            function synchronizeLayer(l){
                if(l.get('ces_layer')){
                    if(l.get('ces_layer').show !== l.get('visible')){
                        var isBaseLayer = defaultFor(l.get('view').isBaseLayer, false);
                        this.changeLayer({
                            name: l.get('name'), visible: l.get('visible'),
                            isBaseLayer: isBaseLayer
                        });
                    }
                }
            }
            function synchronizeColorLegend(p){
                this.checkColorscale(p.get('download').id);
            }
            // Go through config to make any changes done while widget
            // not active (not in view)
            globals.baseLayers.each(synchronizeLayer.bind(this));
            globals.products.each(synchronizeLayer.bind(this));
            globals.overlays.each(synchronizeLayer.bind(this));

            // Recheck color legends
            globals.products.each(synchronizeColorLegend.bind(this));

            this.connectDataEvents();

            // Redraw to make sure we are at current selection
            this.createDataFeatures(
                globals.swarm.get('data'),
                'pointcollection', 'band'
            );

            $('#bb_selection').unbind('click');
            $('#bb_selection').click(function(){
                if($('#bb_selection').text() === 'Select Area'){
                    $('#bb_selection').html('Deactivate');
                    $('.bboxEdit').removeClass('hidden');
                    $('#bboxWestForm')[0].focus();
                    $('#bboxWestForm')[0].select();
                    Communicator.mediator.trigger('selection:activated',{
                        id:'bboxSelection',
                        active:true,
                        selectionType:'single'
                    });
                } else if ($('#bb_selection').text() === 'Deactivate'){
                    $('#bb_selection').html('Select Area');
                    $('.bboxEdit').addClass('hidden');
                    Communicator.mediator.trigger('selection:activated', {
                        id:'bboxSelection',
                        active:false,
                        selectionType:'single'
                    });
                } else if ($('#bb_selection').text() === 'Clear Selection'){
                    $('#bb_selection').html('Select Area');
                    $('.bboxEdit').addClass('hidden');
                    //clear selection to enable new draw save
                    delete this.bboxEdit;
                    Communicator.mediator.trigger('selection:changed', null);
                }
            }.bind(this));
            return this;
        }, // END of onShow

        fillBboxForms: function(){
            // fill bbox forms from localstorage data
            if (localStorage.getItem('areaSelection') !== "null" && localStorage.getItem('areaSelection') !== null){
                var bbox = JSON.parse(localStorage.getItem('areaSelection'));
                $("#bboxWestForm").val(parseFloat(bbox.w).toFixed(4));
                $("#bboxEastForm").val(parseFloat(bbox.e).toFixed(4));
                $("#bboxNorthForm").val(parseFloat(bbox.n).toFixed(4));
                $("#bboxSouthForm").val(parseFloat(bbox.s).toFixed(4));
            }
        },

        fillBboxFormsWhileDrawing: function(bbox){
            // fill bbox forms with given bbox and fix it if necessary
            var bboxFixed = this.wrapBbox(bbox);
            $("#bboxWestForm").val(bboxFixed.w.toFixed(4));
            $("#bboxEastForm").val(bboxFixed.e.toFixed(4));
            $("#bboxNorthForm").val(bboxFixed.n.toFixed(4));
            $("#bboxSouthForm").val(bboxFixed.s.toFixed(4));
        },

        connectDataEvents: function(){
            globals.swarm.on('change:data', function(model, data) {
                var refKey = 'Timestamp';
                if(!data.hasOwnProperty(refKey)){
                    refKey = 'timestamp';
                }
                if (data.hasOwnProperty(refKey) && data[refKey].length>0){
                    this.createDataFeatures(data, 'pointcollection', 'band');
                }else{
                    for (var i = 0; i < this.activeCollections.length; i++) {
                        if(this.featuresCollection.hasOwnProperty(this.activeCollections[i])){
                            this.map.scene.primitives.remove(
                                this.featuresCollection[this.activeCollections[i]]
                            );
                            delete this.featuresCollection[this.activeCollections[i]];
                        }
                    }
                    this.activeCollections = [];
                }
            }, this);

            globals.swarm.on('change:filters', function(model, filters) {
                this.createDataFeatures(globals.swarm.get('data'), 'pointcollection', 'band');
            }, this);
        },

        onResize: function() {
            this.bindPolarButtons();
            if(this.map._sceneModePicker){
                var container = this.map._sceneModePicker.container;
                var scene = this.map._sceneModePicker.viewModel._scene;
                this.map._sceneModePicker.destroy();
                var modepicker = new Cesium.SceneModePicker(container, scene);
                this.map._sceneModePicker = modepicker;
            }
        },

        //method to create layer depending on protocol
        //setting possible description attributes
        createLayer: function (layerdesc) {

            var returnLayer = null;
            var views = layerdesc.get('views');
            var view;

            if( typeof(views) === 'undefined'){
              view = layerdesc.get('view');
            } else {
            
                if (views.length === 1){
                    view = views[0];
                } else {
                    // FIXXME: this whole logic has to be replaced by a more robust method, i.e. a viewer
                    // defines, which protocols to support and get's the corresponding views from the
                    // config then.

                    // For now: prefer WMTS over WMS, if available:
                    var wmts = _.find(views, function(view){ 
                        return view.protocol === 'WMTS'; 
                    });
                    if(wmts){
                        view = wmts;
                    } else {
                        var wms = _.find(views, function(view){
                            return view.protocol === 'WMS'; 
                        });
                        if (wms) {
                            view = wms;
                        } else {
                            // No supported protocol defined in config.json!
                            return null;
                        }
                    }
                }
            }

            // Manage custom attribution element (add attribution for active layers)
            if(layerdesc.get('visible')){
                this.addCustomAttribution(view);
            }
            var options;
            switch(view.protocol){
                case 'WMTS':
                    options = {
                        url : view.urls[0],
                        layer : view.id,
                        style : view.style,
                        format : view.format,
                        tileMatrixSetID : view.matrixSet,
                        maximumLevel: 13,
                        tilingScheme: new Cesium.GeographicTilingScheme({
                            numberOfLevelZeroTilesX: 2, numberOfLevelZeroTilesY: 1
                        }),
                        credit : new Cesium.Credit(view.attribution),
                        show: layerdesc.get('visible')
                    };
                    if(view.hasOwnProperty('urlTemplate') && view.hasOwnProperty('subdomains')){
                        options.url = view.urlTemplate;
                        options.subdomains = view.subdomains;
                    }
                    returnLayer = new Cesium.WebMapTileServiceImageryProvider(options);
                break;

                case 'WMS':
                    var params = $.extend({
                        transparent: 'true',
                    }, Cesium.WebMapServiceImageryProvider.DefaultParameters);

                    // Check if layer has additional parameters configured
                    var addParams = {transparent: true};
                    var styles;
                    if(layerdesc.get('parameters')){
                        options = layerdesc.get('parameters');
                        var keys = _.keys(options);
                        _.each(keys, function(key){
                            if(options[key].selected){
                                addParams.dim_bands = key;
                                addParams.dim_range = 
                                    options[key].range[0]+','+options[key].range[1];
                                styles = options[key].colorscale;
                            }
                        });
                    }
                    var cr = layerdesc.get('coefficients_range');
                    if(cr){
                        addParams.dim_coeff = cr.join();
                    }
                    addParams.styles = styles; 
                    if(layerdesc.get('timeSlider')){
                        var string = 
                            getISODateTimeString(this.beginTime) + '/'+
                            getISODateTimeString(this.endTime);
                        addParams.time = string;
                    }
                    if(layerdesc.get('height')){
                        addParams.elevation = layerdesc.get('height');
                    }
                    if(layerdesc.get('model_expression')){
                        addParams.models = view.id + "=" + layerdesc.get('model_expression');
                    }
                    params.format = layerdesc.get('views')[0].format;
                    returnLayer = new Cesium.WebMapServiceImageryProvider({
                        url: view.urls[0],
                        layers : view.id,
                        tileWidth: layerdesc.get('tileSize'),
                        tileHeight: layerdesc.get('tileSize'),
                        enablePickFeatures: false,
                        parameters: params
                    });

                    for (var par in addParams){
                        returnLayer.updateProperties(par, addParams[par]);
                    }

                break;

                case 'WPS':
                    returnLayer = new Cesium.SingleTileImageryProvider({
                        url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
                    });
                 break;

                default:
                  // No supported view available
                  // Return dummy Image provider to help with with sorting of layers 
                  //return  new Cesium.WebMapServiceImageryProvider();
                  returnLayer = false;
                break;
            }
            return returnLayer;
        },

        centerMap: function(data) {
            //this.map.setCenter(new OpenLayers.LonLat(data.x, data.y), data.l);
            this.model.set({
                'center': [data.x, data.y],
                'zoom': data.l
            });
        },

        onSortProducts: function(shifts) {
            // Search for moved layer
            // Sorting only works on model layers so we filter them out first
            globals.products.each(function(product) {
                var cesLayer = product.get('ces_layer');
                if(cesLayer && shifts.hasOwnProperty(product.get('name'))){
                    // Raise or Lower the layer depending on movement
                    var toMove = shifts[product.get('name')];
                    for(var i=0; i<Math.abs(toMove); ++i){
                        if(toMove < 0){
                            this.map.scene.imageryLayers.lower(cesLayer);
                        } else if(toMove > 0){
                            this.map.scene.imageryLayers.raise(cesLayer);
                        }
                    }
                }
            }, this);
            console.log('Map products sorted');
        },

        onUpdateOpacity: function(options) {

            globals.products.each(function(product) {
                if(product.get('download').id === options.model.get('download').id){
                    var cesLayer = product.get('ces_layer');

                    // Get special layer of custom model if needed
                    if (this.checkComposedForSHC(product)){
                        var customModel = globals.products.find(function(p){
                            return p.get("download").id === "Custom_Model";
                        });
                        cesLayer = customModel.get('ces_layer');
                    }

                    // Find active parameter and satellite
                    var sat, key;
                    _.each(globals.swarm.products, function(p){
                        var keys = _.keys(p);
                        for (var i = 0; i < keys.length; i++) {
                            if(p[keys[i]] === options.model.get('views')[0].id){
                                sat = keys[i];
                            }
                        }
                    });
                    _.each(options.model.get('parameters'), function(pa, k){
                        if(pa.selected){
                            key = k;
                        }
                    });
                    if( sat && key &&_.has(this.featuresCollection, (sat+key)) ){
                        var fc = this.featuresCollection[(sat+key)];
                        if(fc.hasOwnProperty('geometryInstances')){
                            for (var i = fc._instanceIds.length - 1; i >= 0; i--) {
                                var attributes = fc.getGeometryInstanceAttributes(fc._instanceIds[i]);
                                var nc = attributes.color;
                                nc[3] = Math.floor(options.value*255);
                                attributes.color = Cesium.ColorGeometryInstanceAttribute.toValue(
                                    Cesium.Color.fromBytes(nc[0], nc[1], nc[2], nc[3])
                                );
                            }
                        }else{
                            for (var i = fc.length - 1; i >= 0; i--) {
                                var b = fc.get(i);
                                if(b.color){
                                    var c = b.color.clone();
                                    c.alpha = options.value;
                                    b.color = c;
                                }else if(b.appearance){
                                    var c = b.appearance.material.uniforms.color.clone();
                                    c.alpha = options.value;
                                    b.appearance.material.uniforms.color = c;
                                }
                            }
                        }
                    }else if(cesLayer){
                        cesLayer.alpha = options.value;
                    }
                }
            }, this);
        },

        addCustomAttribution: function(view) {
            if(view.hasOwnProperty('attribution')){
                $('#cesium_custom_attribution').append(
                    '<div id="' + view.id.replace(/[^A-Z0-9]/ig, '_') +
                    '" style="float: left; margin-left: 3px;">'+
                    view.attribution + '</div>'
                );
            }
        },

        removeCustomAttribution: function(view){
            $('#'+view.id.replace(/[^A-Z0-9]/ig, '_')).remove();
        },

        changeLayer: function(options) {
            // Seems for some reason that a layer needs to be as shown at all times
            // or cesium will throw an error, so first activate the new layer, then 
            // deactivate the others
            if (options.isBaseLayer){
                globals.baseLayers.each(function(baselayer) {
                    var cesLayer = baselayer.get('ces_layer');
                    if (cesLayer) {
                        if(baselayer.get('name') === options.name){
                            cesLayer.show = true;
                            this.addCustomAttribution(baselayer.get('views')[0]);
                        }
                    }
                }, this);

                globals.baseLayers.each(function(baselayer) {
                    var cesLayer = baselayer.get('ces_layer');
                    if (cesLayer) {
                        if(baselayer.get('name') !== options.name){
                            cesLayer.show = false;
                            this.removeCustomAttribution(baselayer.get('views')[0]);
                        }
                    }
                }, this);

            } else {
                globals.overlays.each(function(overlay) {
                    if(overlay.get('name') === options.name){
                        var cesLayer = overlay.get('ces_layer');
                        cesLayer.show = options.visible;
                        if(options.visible){
                            this.addCustomAttribution(overlay.get('view'));
                        }else{
                            this.removeCustomAttribution(overlay.get('view'));
                        }
                    }
                }, this);

                globals.products.each(function(product) {
                    if(product.get('name') === options.name){
                        product.set('visible', options.visible);
                        this.checkColorscale(product.get('download').id);

                       // Check if product contains shc file, if yes we need
                        // to switch to wps for visualization
                        if(this.checkComposedForSHC(product)){
                            this.loadShc(product, product.get('visible'));
                        } else if (product.get('views')[0].protocol === 'WMS' ||
                                  product.get('views')[0].protocol === 'WMTS' ){
                            var cesLayer;
                            var parameters = product.get('parameters');
                            var coeffRange = product.get('coefficients_range');
                            if (parameters){
                                var band;
                                var keys = _.keys(parameters);
                                _.each(keys, function(key){
                                    if(parameters[key].selected){
                                        band = key;
                                    }
                                });
                                var style = parameters[band].colorscale;
                                var range = parameters[band].range;

                                if (band === 'Fieldlines'){
                                    if(options.visible){
                                        this.activeFL.push(product.get('download').id);
                                    }else{
                                        if (this.activeFL.indexOf(product.get('download').id)!==-1){
                                            this.activeFL.splice(this.activeFL.indexOf(product.get('download').id), 1);
                                        }
                                    }
                                    this.checkFieldLines();
                                } else {

                                    cesLayer = product.get('ces_layer');
                                    if(band){
                                        cesLayer.imageryProvider.updateProperties(
                                            'dim_bands', band
                                        );
                                    }
                                    if(range){
                                        cesLayer.imageryProvider.updateProperties(
                                            'dim_range', (range[0]+','+range[1])
                                        );
                                    }
                                    if(style){
                                        cesLayer.imageryProvider.updateProperties(
                                            'styles', style
                                        );
                                    }
                                    if(coeffRange){
                                        cesLayer.imageryProvider.updateProperties(
                                            'dim_coeff', (coeffRange[0]+','+coeffRange[1])
                                        );
                                    }
                                    cesLayer.show = options.visible;
                                }

                            }else{
                                cesLayer = product.get('ces_layer');
                                cesLayer.show = options.visible;
                            }
                        } // END of WMS and WMTS case
                    }

                    if(product.get('model') && product.get('name') === options.name){
                        if (this.activeModels.indexOf(product.get('name'))!==-1){
                            this.activeModels.splice(
                                this.activeModels.indexOf(product.get('name')), 1
                            );
                        }

                    }
                }, this); // END of global products loop
            }
        }, // END of changeLayer


        checkComposedForSHC: function(product){
            var cesLayer;
            var parameters = product.get('parameters');
            var coeffRange = product.get('coefficients_range');

            if (parameters){
                var band;
                var keys = _.keys(parameters);
                _.each(keys, function(key){
                    if(parameters[key].selected){
                        band = key;
                    }
                });
                var style = parameters[band].colorscale;
                var range = parameters[band].range;
                if (band === 'Fieldlines'){
                    if(product.get('visible')){
                        this.activeFL.push(product.get('download').id);
                    }else{
                        if (this.activeFL.indexOf(product.get('download').id)!==-1){
                            this.activeFL.splice(this.activeFL.indexOf(product.get('download').id), 1);
                        }
                    }
                    //this.checkFieldLines();
                }
            }

            if(product.attributes.hasOwnProperty('shc') && product.attributes.hasOwnProperty('model_expression') && 
                    product.get('model_expression').indexOf('Custom_Model')!==-1 &&
                    product.get('shc') !== null){
                return true;
            } else {
                // If product is compose model and no longer SHC active hide shc 
                // related layer 

                if(product.get('download').id === 'Magnetic_Model'){
                    // Get special layer of custom model if needed
                    var customModel = globals.products.find(function(p){
                        return p.get("download").id === "Custom_Model";
                    });
                    customModel.get('ces_layer').show = false;
                }

                return false;
            }
        },

        loadShc: function(product, visible){

            if(visible){
                // Check if shc is in expresion and shc has been loaded
                if(product.get('download').id === 'Magnetic_Model' &&
                    product.attributes.hasOwnProperty('shc') && 
                    product.get('model_expression').indexOf('Custom_Model')!==-1 &&
                    product.get('shc') !== null){

                    // If model visible and all conditions apply load layer with
                    // WPS information, return true
                    var payload;
                    var url = product.get('views')[0].urls[0];

                    var shc = product.get('shc');
                    var parameters = product.get('parameters');
                    var band;
                    var keys = _.keys(parameters);
                    _.each(keys, function(key){
                        if(parameters[key].selected){
                            band = key;
                        }
                    });
                    var style = parameters[band].colorscale;
                    var height = product.get('height');
                    var range = parameters[band].range;
                    var coeffRange = product.get('coefficients_range');

                    var options = {
                        'model_expression': product.get("model_expression"),
                        'variable': band,
                        'begin_time': getISODateTimeString(this.beginTime),
                        'end_time': getISODateTimeString(this.endTime),
                        'elevation': product.get('height'),
                        'shc': product.get('shc'),
                        'height': 512,
                        'width': 1024,
                        'style': style,
                        'range_min': range[0],
                        'range_max': range[1],
                    };

                    if (this.bboxsel !== null){
                        var bb = this.bboxsel;
                        options.bbox =  bb.join();
                    }

                    if(band === 'Fieldlines'){
                        var customModel = globals.products.find(function(p){
                            return p.get("download").id === "Custom_Model";
                        });
                        customModel.get('ces_layer').show = false;
                        this.checkFieldLines();
                        return;
                    }

                    payload = tmplEvalModel(options);

                    // Hide current WMS layer (as now we use the WPS layer)
                    product.get('ces_layer').show = false;
                    var that = this;

                    $.post(url, payload)
                        .done(function( data ) {

                            // Get special layer of custom model if needed
                            var customModel = globals.products.find(function(p){
                                return p.get("download").id === "Custom_Model";
                            });
                            that.customModelLayer = customModel.get('ces_layer');
                            that.customModelLayer.show = false;

                            var map = that.map;
                            var customModelLayer = that.customModelLayer;
                            var index = that.map.scene.imageryLayers.indexOf(customModelLayer);
                            that.map.scene.imageryLayers.remove(customModelLayer);

                            if(index>0){
                                var imageURI = 'data:image/gif;base64,'+data;
                                var layerOptions = {url: imageURI};
                                if(bb && bb.length === 4){
                                    var rec = new Cesium.Rectangle(
                                        Cesium.Math.toRadians(bb[1]),
                                        Cesium.Math.toRadians(bb[0]),
                                        Cesium.Math.toRadians(bb[3]),
                                        Cesium.Math.toRadians(bb[2])
                                    );
                                    layerOptions.rectangle = rec;
                                }
                                var imagelayer = new Cesium.SingleTileImageryProvider(layerOptions);
                                customModelLayer = 
                                    map.scene.imageryLayers.addImageryProvider(imagelayer, index);
                                customModel.set('ces_layer', customModelLayer);
                                customModelLayer.alpha = product.get('opacity');
                                customModelLayer.show = true;
                            }
                        });
                    return true;
                } else {
                    return false;
                }
            }else{
                // If composed model has custom model in expression we deactivate
                // layer here, as not visible any longer
                if(product.get('download').id === 'Magnetic_Model' &&
                    product.attributes.hasOwnProperty('shc') && 
                    product.get('model_expression').indexOf('Custom_Model')!==-1 &&
                    product.get('shc') !== null){

                    // Get special layer of custom model if needed
                    var customModel = globals.products.find(function(p){
                        return p.get("download").id === "Custom_Model";
                    });
                    customModel.get('ces_layer').show = false;
                }
                return false;
            }
        },


        createDataFeatures: function (results){
            var refKey = 'Timestamp';
            if(!results.hasOwnProperty(refKey)){
                refKey = 'timestamp';
            }
            if (results.hasOwnProperty(refKey) && results[refKey].length>0){
                // The feature collections are removed directly when a change happens
                // because of the asynchronous behavior it can happen that a collection
                // is added between removing it and adding another one so here we make sure
                // it is empty before overwriting it, which would lead to a not referenced
                // collection which is no longer deleted.
                // I remove it before the response because a direct feedback to the user is important
                // There is probably a cleaner way to do this
                for (var i = 0; i < this.activeCollections.length; i++) {
                    if(this.featuresCollection.hasOwnProperty(this.activeCollections[i])){
                        this.map.scene.primitives.remove(this.featuresCollection[this.activeCollections[i]]);
                        delete this.featuresCollection[this.activeCollections[i]];
                    }
                }
                this.activeCollections = [];
                var settings = {};
                var curProd = null;

                globals.products.each(function(product) {
                    if(product.get('visible')){
                        curProd = product;
                        var params = product.get('parameters');
                        for (var k in params){
                            if(params[k].selected){
                                var sat = false;
                                var prodKeys = _.keys(globals.swarm.products);
                                for (var i = prodKeys.length - 1; i >= 0; i--) {
                                    var satKeys = _.keys(globals.swarm.products[prodKeys[i]]);
                                    for (var j = satKeys.length - 1; j >= 0; j--) {
                                        if (globals.swarm.products[prodKeys[i]][satKeys[j]] === 
                                            product.get('views')[0].id) {
                                            sat = satKeys[j];
                                        }
                                    }
                                }
                                if(sat) {
                                    if(!settings.hasOwnProperty(sat)){
                                        settings[sat] = {};
                                    }
                                    if(!settings[sat].hasOwnProperty(k)){
                                        settings[sat][k] = product.get('parameters')[k];
                                    }
                                    settings[sat][k].band = k;
                                    settings[sat][k].alpha = Math.floor(product.get('opacity')*255);
                                    settings[sat][k].outlines = product.get('outlines');
                                    settings[sat][k].outline_color = product.get('color');
                                }
                            }
                        }
                    }
                });

                if (!_.isEmpty(settings) ){

                    /*_.uniq(results, function(row) { 
                            return row.id; 
                    })*/
                    _.uniq(results.id)
                    .map(function(obj){
                        var parameters = _.filter(
                            SCALAR_PARAM,
                            function(par){
                                return settings[obj].hasOwnProperty(par);
                            });

                            for (var i = 0; i < parameters.length; i++) {
                                this.activeCollections.push(obj+parameters[i]);
                                this.featuresCollection[obj+parameters[i]] = 
                                    new Cesium.PointPrimitiveCollection();
                                if(!this.map.scene.context._gl.getExtension('EXT_frag_depth')){
                                    this.featuresCollection[obj+parameters[i]]._rs = 
                                        Cesium.RenderState.fromCache({
                                            depthTest : {
                                                enabled : true,
                                                func : Cesium.DepthFunction.LESS
                                            },
                                            depthMask : false,
                                            blending : Cesium.BlendingState.ALPHA_BLEND
                                        });
                                }
                            }
                            parameters = _.filter(VECTOR_PARAM, function(par){
                                return settings[obj].hasOwnProperty(par);
                            });
                            for (var i = 0; i < parameters.length; i++) {
                                this.activeCollections.push(obj+parameters[i]);
                                this.featuresCollection[obj+parameters[i]] = new Cesium.Primitive({
                                    geometryInstances : [],
                                    appearance : new Cesium.PolylineColorAppearance({
                                        translucent : true
                                    }),
                                    releaseGeometryInstances: false
                                });
                            }
                    },this);

                    var maxRad = this.map.scene.globe.ellipsoid.maximumRadius;
                    var scaltype = new Cesium.NearFarScalar(1.0e2, 4, 14.0e6, 0.8);
                    var timeBucket = {'Alpha':{}, 'Bravo':{}, 'Charlie':{}};
                    var linecnt = 0;

                    //_.each(results, function(row){
                    var lastTS = null;
                    for (var r = 0; r < results[refKey].length; r++) {
                        var row = {};
                        for(var k in results){
                            row[k] = results[k][r];
                        }
                        var show = true;
                        var filters = globals.swarm.get('filters');
                        var heightOffset, color;

                        if(filters){
                            for (var f in filters){
                                show = filters[f](row[f]);
                                //show = !(row[k]<filters[k][0] || row[k]>filters[k][1]);
                                if(!show){break;}
                            }
                        }
                        if (show){
                            // Find parameter in settings which is also in row 
                            // these are the ones that are active
                            var actvParam = _.keys(settings[row.id]);
                            var tovisualize = _.filter(actvParam, function(ap){
                                // Check if component is vector component
                                if(VECTOR_BREAKDOWN.hasOwnProperty(ap)){
                                    var b = VECTOR_BREAKDOWN[ap];
                                    return (
                                        row.hasOwnProperty(b[0]) &&
                                        row.hasOwnProperty(b[1]) &&
                                        row.hasOwnProperty(b[2])
                                    );
                                }else{
                                    return row.hasOwnProperty(ap);
                                }
                            });

                            for (var i = tovisualize.length - 1; i >= 0; i--) {
                                var set = settings[row.id][tovisualize[i]];
                                var alpha = set.alpha;
                                this.plot.setColorScale(set.colorscale);
                                this.plot.setDomain(set.range);

                                if (_.find(SCALAR_PARAM, function(par){
                                    return set.band === par;
                                })) {
                                    if(tovisualize[i] === 'Bubble_Probability'){
                                        if(row[set.band] <= 0.1){
                                            continue;
                                        }
                                    }
                                    heightOffset = i*210000;

                                    if(!isNaN(row[set.band])){
                                        color = this.plot.getColor(row[set.band]);
                                        var options = {
                                            position : new Cesium.Cartesian3.fromDegrees(
                                                row.Longitude, row.Latitude,
                                                row.Radius-maxRad+heightOffset
                                            ),
                                            color : new Cesium.Color.fromBytes(
                                                color[0], color[1], color[2], alpha
                                            ),
                                            pixelSize : 8,
                                            scaleByDistance : scaltype
                                        };
                                        if(set.outlines){
                                            options.outlineWidth = 0.5;
                                            options.outlineColor = 
                                                Cesium.Color.fromCssColorString(set.outline_color);
                                        }
                                        this.featuresCollection[row.id+set.band].add(options);
                                    }
                                    
                                } else if (
                                    _.find(VECTOR_PARAM, function(par){
                                        return set.band === par;
                                    })) {

                                    if(tovisualize[i] === 'Absolute_STEC' ||
                                       tovisualize[i] === 'Absolute_VTEC' ||
                                       tovisualize[i] === 'Elevation_Angle' ||
                                       tovisualize[i] === 'Relative_STEC' ||
                                       tovisualize[i] === 'Relative_STEC_RMS'){
                                        if(lastTS === null){
                                            lastTS = row.Timestamp;
                                        }
                                        var diff = row.Timestamp.getTime()-lastTS.getTime();
                                        if(diff <= 40000 && diff > 0){
                                            //lastTS = row.Timestamp;
                                            continue;
                                        }

                                        lastTS = row.Timestamp;


                                        color = this.plot.getColor(row[set.band]);
                                        var addLen = 10;
                                        var dir = [
                                            row.GPS_Position_X - row.LEO_Position_X,
                                            row.GPS_Position_Y - row.LEO_Position_Y,
                                            row.GPS_Position_Z - row.LEO_Position_Z
                                        ];
                                        var len = Math.sqrt((dir[0]*dir[0])+(dir[1]*dir[1])+(dir[2]*dir[2]));
                                        var uvec = dir.map(function(x) { return x / len; });
                                        var secPos = [
                                            row.LEO_Position_X + uvec[0]*500000,
                                            row.LEO_Position_Y + uvec[1]*500000,
                                            row.LEO_Position_Z + uvec[2]*500000
                                        ];

                                        this.featuresCollection[row.id+set.band].geometryInstances.push( 
                                            new Cesium.GeometryInstance({
                                                geometry : new Cesium.PolylineGeometry({
                                                    positions : [
                                                        new Cesium.Cartesian3(row.LEO_Position_X, row.LEO_Position_Y, row.LEO_Position_Z),
                                                        new Cesium.Cartesian3(secPos[0], secPos[1], secPos[2])
                                                    ],
                                                    followSurface: false,
                                                    width: 1.7,
                                                    vertexFormat : Cesium.PolylineColorAppearance.VERTEX_FORMAT
                                                }),
                                                id: 'vec_line_'+linecnt,
                                                attributes : {
                                                    color : Cesium.ColorGeometryInstanceAttribute.fromColor(
                                                        new Cesium.Color.fromBytes(color[0], color[1], color[2], alpha)
                                                    )
                                                }
                                            })
                                        );

                                        linecnt++;

                                    } else {

                                        var sb = VECTOR_BREAKDOWN[set.band];
                                        heightOffset = i*210000;

                                        // Check if residuals are active!
                                        if(!isNaN(row[sb[0]]) &&
                                           !isNaN(row[sb[1]]) &&
                                           !isNaN(row[sb[2]])) {
                                            var vLen = Math.sqrt(Math.pow(row[sb[0]],2)+Math.pow(row[sb[1]],2)+Math.pow(row[sb[2]],2));
                                            color = this.plot.getColor(vLen);
                                            var addLen = 10;
                                            var vN = (row[sb[0]]/vLen)*addLen;
                                            var vE = (row[sb[1]]/vLen)*addLen;
                                            var vC = (row[sb[2]]/vLen)*addLen;
                                            this.featuresCollection[row.id+set.band].geometryInstances.push( 
                                                new Cesium.GeometryInstance({
                                                    geometry : new Cesium.PolylineGeometry({
                                                        positions : Cesium.Cartesian3.fromDegreesArrayHeights([
                                                            row.Longitude, row.Latitude, (row.Radius-maxRad+heightOffset),
                                                            (row.Longitude+vE), (row.Latitude+vN), ((row.Radius-maxRad)+vC*30000)
                                                        ]),
                                                        followSurface: false,
                                                        width: 1.7
                                                    }),
                                                    id: 'vec_line_'+linecnt,
                                                    attributes : {
                                                        color : Cesium.ColorGeometryInstanceAttribute.fromColor(
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
                    };

                    for (var j = 0; j < this.activeCollections.length; j++) {
                        this.map.scene.primitives.add(this.featuresCollection[this.activeCollections[j]]);
                    }
                }
            }
        },

        onLayerOutlinesChanged: function(collection){
            this.createDataFeatures(globals.swarm.get('data'), 'pointcollection', 'band');
        },

        OnLayerParametersChanged: function(layer){

            globals.products.each(function(product) {
                if(product.get('name')===layer){

                    this.checkColorscale(product.get('download').id);
                    var hexcolor = product.get('color');
                        hexcolor = hexcolor.substring(1, hexcolor.length);
                    var parameters = product.get('parameters');
                    var band;
                    var keys = _.keys(parameters);
                    _.each(keys, function(key){
                        if(parameters[key].selected){
                            band = key;
                        }
                    });
                    var style = parameters[band].colorscale;
                    var range = parameters[band].range;
                    var height = product.get('height');
                    var contours = product.get('contours');
                    var coeffRange = product.get('coefficients_range');
                    var id = product.get('download').id;
                    var cesLayer;

                    if(product.get('views')[0].protocol === 'CZML'){
                        this.createDataFeatures(globals.swarm.get('data'), 'pointcollection', 'band');

                    }else if(product.get('views')[0].protocol === 'WMS'){
                        // Check if product contains shc file, if yes we need
                        // to switch to wps for visualization
                        if(this.checkComposedForSHC(product)){
                            this.loadShc(product, product.get('visible'));
                        }else if (band === 'Fieldlines' ){
                            if(product.get('visible')){
                                cesLayer = product.get('ces_layer');
                                cesLayer.show = false;
                                this.map.scene.imageryLayers.remove(cesLayer, false);

                                // When changing height or coefficient range and fieldlienes is selected
                                // model would be added multiple times, need to check if model already 
                                // marked as active and avoid adding it to list
                                if (this.activeFL.indexOf(product.get('download').id)===-1){
                                    this.activeFL.push(product.get('download').id);
                                }

                            }else{
                                if (this.activeFL.indexOf(product.get('download').id)!==-1){
                                    this.activeFL.splice(this.activeFL.indexOf(product.get('download').id), 1);
                                }
                            }
                            this.checkFieldLines();
                            
                        } else if (product.get('differenceTo') !== null ){
                            if(product.get('visible')){
                                var refProd = globals.products.filter(function(p){
                                    return p.get('download').id === product.get('differenceTo');
                                });
                                this.checkModelDifference(product, refProd[0]);
                            }else{
                                product.get('ces_layer').show = false;
                            }

                        } else {

                            if (this.activeFL.indexOf(product.get('download').id)!==-1){
                                this.activeFL.splice(this.activeFL.indexOf(product.get('download').id), 1);
                            }

                            this.checkFieldLines();

                            if(product.get('name')===layer){

                                if (product.get('differenceTo') === null ){
                                    var differenceLayer = product.get('ces_layer');
                                    var modelLayer = product.get('backupLayer');

                                    // Check if we are looking to original WMS
                                    // layer by checking layer property
                                    if(modelLayer && 
                                        !differenceLayer._imageryProvider.hasOwnProperty('_layers')
                                    ){
                                        var index = this.map.scene.imageryLayers.indexOf(differenceLayer);
                                        this.map.scene.imageryLayers.remove(differenceLayer);
                                        this.map.scene.imageryLayers.add(modelLayer, index);
                                        product.set('ces_layer', modelLayer);
                                        modelLayer.alpha = product.get('opacity');
                                    }
                                }

                                cesLayer = product.get('ces_layer');

                                if(product.get('visible')){
                                    cesLayer.show = true;
                                }

                                cesLayer.imageryProvider.updateProperties('dim_bands', band);
                                cesLayer.imageryProvider.updateProperties('dim_range', (range[0]+','+range[1]));
                                cesLayer.imageryProvider.updateProperties('elevation', height);
                                if(contours){
                                    cesLayer.imageryProvider.updateProperties('dim_contours', 1);
                                } else {
                                    cesLayer.imageryProvider.updateProperties('dim_contours', 0);
                                }
                                if(style){
                                    cesLayer.imageryProvider.updateProperties('styles', style);
                                }
                                
                                if(coeffRange && id !== "Magnetic_Model"){
                                    cesLayer.imageryProvider.updateProperties('dim_coeff', (coeffRange[0]+','+coeffRange[1]));
                                }
                                // layers=MyNewModel;models=MyNewModel='model1'-'model2'+'model3'
                                if(id === "Magnetic_Model"){
                                    var modelExpressionHtml = product.get('model_expression');
                                    var queryBegin = id + '=';
                                    cesLayer.imageryProvider.updateProperties('models', queryBegin + modelExpressionHtml);
                                }
                                if (cesLayer.show){
                                    var index = this.map.scene.imageryLayers.indexOf(cesLayer);
                                    this.map.scene.imageryLayers.remove(cesLayer, false);
                                    this.map.scene.imageryLayers.add(cesLayer, index);
                                }
                            }
                        }
                    }
                }
            }, this);
        },


        onAnalyticsFilterChanged: function(filter){
            console.log(filter);
        },


        onExportGeoJSON: function() {
            var geojsonstring = this.geojson.write(this.vectorLayer.features, true);
            var blob = new Blob([geojsonstring], {
                type: 'text/plain;charset=utf-8'
            });
            saveAs(blob, 'selection.geojson');
        },

        onGetGeoJSON: function () {
            return this.geojson.write(this.vectorLayer.features, true);
        },

        onGetMapExtent: function(){
            return this.getMapExtent();
        },

        getMapExtent: function(){
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
                var center = new Cesium.Cartesian2(this.map.scene.canvas.width/2, this.map.scene.canvas.height/2);
                center = this.map.scene.camera.pickEllipsoid(center, ellipsoid);
                if (center && center !== null){
                    center = ellipsoid.cartesianToCartographic(center);
                    return {
                        left: Cesium.Math.toDegrees(center.longitude) - 90,
                        bottom: Cesium.Math.toDegrees(center.latitude) - 45,
                        right: Cesium.Math.toDegrees(center.longitude) + 90,
                        top: Cesium.Math.toDegrees(center.latitude) + 45
                    };
                }else{
                    // If everything fails assume whole world is visible which is wrong
                    return {left: -180, bottom: -90, right: 180, top: 90};
                }
            }
        },

        renderSVG: function(svg, width, height){
            $('#imagerenderercanvas').attr('width', width);
            $('#imagerenderercanvas').attr('height', height);
            var c = document.querySelector('#imagerenderercanvas');
            var ctx = c.getContext('2d');
            // Clear the canvas
            ctx.clearRect(0, 0, width, height);
            ctx.drawSvg(svg, 0, 0, height, width);
            return c.toDataURL('image/jpg');
        },

        createViewportQuad: function(img, x, y, width, height){
            var newmat = new Cesium.Material.fromType('Image', {
                image : img,
                color: new Cesium.Color(1, 1, 1, 1),
            });
            return new Cesium.ViewportQuad(
                new Cesium.BoundingRectangle(x, y, width, height), newmat
            );
        },

        checkModelDifference: function(model, referenceModel){

            if(model.get('download').id === 'Custom_Model' || !model.get('visible')){
                return;
            }
            model.get('ces_layer').show = false;
            var that = this;
            var url = model.get('views')[0].urls[0];
            var models = [model.get('download').id, referenceModel.get('download').id];
            var product = model;

            var shc = defaultFor(referenceModel.get('shc'), model.get('shc'));

            var parameters = model.get('parameters');
            var band;
            var keys = _.keys(parameters);
            _.each(keys, function(key){
                if(parameters[key].selected){
                    band = key;
                }
            });

            var rangeMin = parameters[band].range[0];
            var rangeMax = parameters[band].range[1];
            var style = parameters[band].colorscale;
            var height = model.get('height');

            var reqOptions = {
                'model': models[0],
                'reference_model': models[1],
                'variable': band,
                'begin_time': getISODateTimeString(this.beginTime),
                'end_time': getISODateTimeString(this.endTime),
                'elevation': height,
                "coeff_min": model.get("coefficients_range")[0],
                "coeff_max": model.get("coefficients_range")[1],
                'shc': shc,
                'height': 512,
                'width': 512,
                'style': style,
                'range_min': rangeMin,
                'range_max': rangeMax
            };

             if (this.bboxsel !== null){
                var bb = this.bboxsel;
                reqOptions.bbox =  bb.join();
            }


            // Remove current layer if available
            var differenceLayer = product.get('ces_layer');
            var modelLayer = product.get('backupLayer');

            // Check if we are looking to original WMS
            // layer by checking layer property
            if(modelLayer && 
                !differenceLayer._imageryProvider.hasOwnProperty('_layers')
            ){
                var index = this.map.scene.imageryLayers.indexOf(differenceLayer);
                this.map.scene.imageryLayers.remove(differenceLayer);
                this.map.scene.imageryLayers.add(modelLayer, index);
                product.set('ces_layer', modelLayer);
                modelLayer.alpha = product.get('opacity');
            }


            $.post(url, tmplEvalModelDiff(reqOptions), 'xml')
                .done(function( data ) {

                    var productLayer = product.get('ces_layer');
                    var index = that.map.scene.imageryLayers.indexOf(productLayer);
                    var imageURI = 'data:image/png;base64,'+data;

                    // Check if we are looking to original WMS
                    // layer by checking layer property
                    if( !productLayer._imageryProvider.hasOwnProperty('_layers')){
                        //that.map.scene.imageryLayers.remove(cesLayer);
                        
                        /*var prov = new Cesium.SingleTileImageryProvider({url: imageURI});

                        differenceLayer = that.map.scene.imageryLayers.addImageryProvider(prov, index);
                        differenceLayer.show = model.get('visible');
                        model.set('ces_layer', differenceLayer);

                        differenceLayer.alpha = model.get('opacity');*/
                    } else {

                        that.map.scene.imageryLayers.remove(productLayer, false);
                        
                        var layerOptions = {url: imageURI};
                        if(bb && bb.length === 4){
                            var rec = new Cesium.Rectangle(
                                Cesium.Math.toRadians(bb[1]),
                                Cesium.Math.toRadians(bb[0]),
                                Cesium.Math.toRadians(bb[3]),
                                Cesium.Math.toRadians(bb[2])
                            );
                            layerOptions.rectangle = rec;
                        }

                        var prov = new Cesium.SingleTileImageryProvider(layerOptions);

                        differenceLayer = that.map.scene.imageryLayers.addImageryProvider(prov, index);
                        differenceLayer.show = model.get('visible');
                        model.set('ces_layer', differenceLayer);

                        differenceLayer.alpha = model.get('opacity');
                    }

                });
            
        },

        checkColorscale: function(pId){
            var visible = true;
            var product = false;
            var indexDel;
            var margin = 20;
            var width = 300;
            var scalewidth =  width - margin *2;

            globals.products.each(function(p) {
                if(p.get('download').id === pId){
                    product = p;
                }
            }, this);

            if (_.has(this.colorscales, pId)){
                // remove object from cesium scene
                this.map.scene.primitives.remove(this.colorscales[pId].prim);
                this.map.scene.primitives.remove(this.colorscales[pId].csPrim);
                indexDel = this.colorscales[pId].index;
                delete this.colorscales[pId];

                // Modify all indices and related height of all colorscales 
                // which are over deleted position

                _.each(this.colorscales, function(value, key, obj) {
                    var i = obj[key].index-1;
                    if (i >= indexDel){
                        var scaleImg = obj[key].prim.material.uniforms.image;
                        var csImg = obj[key].csPrim.material.uniforms.image;
                        this.map.scene.primitives.remove(obj[key].prim);
                        this.map.scene.primitives.remove(obj[key].csPrim);
                        obj[key].prim = this.map.scene.primitives.add(
                            this.createViewportQuad(scaleImg, 0, i*55 +5, width, 55)
                        );
                        obj[key].csPrim = this.map.scene.primitives.add(
                            this.createViewportQuad(csImg, 20, i*55 +42, scalewidth, 10)
                        );
                        obj[key].index = i;
                  
                    }
                },this);
            }

            if(product && product.get('views')[0].protocol === 'WPS' &&
                product.get('shc') === null){
                visible = false;
            }

            if(product.get('timeSliderProtocol') === 'INDEX'){
                visible = false;
            }

            if (product && product.get('showColorscale') &&
                product.get('visible') && visible){

                var options = product.get('parameters');

                if(options){
                    var keys = _.keys(options);
                    var sel = false;

                    _.each(keys, function(key){
                        if(options[key].selected){
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

                    if(logscale){
                        axisScale = d3.scale.log();
                    }else{
                        axisScale = d3.scale.linear();
                    }

                    axisScale.domain([rangeMin, rangeMax]);
                    axisScale.range([0, scalewidth]);

                    var xAxis = d3.svg.axis()
                        .scale(axisScale);

                    if(logscale){
                        var numberFormat = d3.format(',f');
                        function logFormat(d) {
                            var x = Math.log(d) / Math.log(10) + 1e-6;
                            return Math.abs(x - Math.floor(x)) < 0.3 ? numberFormat(d) : '';
                        }
                         xAxis.tickFormat(logFormat);

                    }else{
                        var step = Number( ((rangeMax - rangeMin)/5).toPrecision(3) );
                        var ticks = d3.range(rangeMin,rangeMax+step, step);
                        xAxis.tickValues(ticks);
                        xAxis.tickFormat(d3.format('g'));
                    }

                    var g = svgContainer.append('g')
                        .attr('class', 'x axis')
                        .attr('transform', 'translate(' + [margin, 20]+')')
                        .call(xAxis);

                    // Add layer info
                    var info = product.get('name');
                    if(product.attributes.hasOwnProperty('differenceTo') &&
                        product.get('differenceTo') !== null){
                        info = 'Difference between ' +info+ ' and '+product.get('differenceTo');
                    }
                    info += ' - ' + sel;
                    if(uom){
                        info += ' ['+uom+']';
                    }

                     g.append('text')
                        .style('text-anchor', 'middle')
                        .attr('transform', 'translate(' + [scalewidth/2, 30]+')')
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
                            0, index*55+5, renderWidth, renderHeight
                        )
                    );
                    var csPrim = this.map.scene.primitives.add(
                        this.createViewportQuad(
                            colorscaleimage, 20, index*55 +42, scalewidth, 10
                        )
                    );

                    this.colorscales[pId] = {
                        index: index,
                        prim: prim,
                        csPrim: csPrim
                    };

                    svgContainer.remove();
                }
            }

        },

        onSelectionActivated: function(arg) {
            this.selectionType = arg.selectionType;
            this.fillBboxForms();
            if (arg.active) {
                this.drawhelper.startDrawingRectangle({
                    callback: function(extent) {
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

        onSelectionChanged: function(bbox){

            // It seems the drawhelper muted handlers reset to false and 
            // it creates issues in cesium picking for some reason so
            // we deactivate them again
            this.drawhelper._handlersMuted = true;
            if(bbox){
                // Remove any possible selection and field lines (e.g.by tutorial)
                if(this.extentPrimitive){
                    this.map.entities.remove(this.extentPrimitive);
                }
                _.each(_.keys(this.FLCollection), function(key){
                    this.map.scene.primitives.remove(this.FLCollection[key]);
                    delete this.FLCollection[key];
                }, this);

                this.bboxsel = [bbox.s, bbox.w, bbox.n, bbox.e ];
                var rectangle = Cesium.Rectangle.fromDegrees(bbox.w, bbox.s, bbox.e, bbox.n);
                this.extentPrimitive = this.map.entities.add({
                    id: 'selectionrectangle',
                    rectangle : {
                        coordinates : rectangle,
                        fill : false,
                        outline : true,
                        outlineColor : Cesium.Color.BLUE,
                        outlineWidth: 2
                    }
                });
                this.checkFieldLines();
                $('#bb_selection').html('Clear Selection');

            }else{
                this.bboxsel = null;
                if(this.extentPrimitive){
                    this.map.entities.remove(this.extentPrimitive);
                }
                _.each(_.keys(this.FLCollection), function(key){
                    this.map.scene.primitives.remove(this.FLCollection[key]);
                    delete this.FLCollection[key];
                }, this);
                $('#bb_selection').html('Select Area');
            }

            globals.products.each(function(product) {
                // Check if product contains shc file, if yes we need
                // to switch to wps for visualization
                if(this.checkComposedForSHC(product)){
                    this.loadShc(product, product.get('visible'));
                }

            },this);
        },

        checkFieldLines: function(){
            if(this.activeFL.length>0 && this.bboxsel){

                var url, modelId, color, band, style, range, logarithmic,
                    parameters, name;

                globals.products.each(function(product) {

                    if(this.activeFL.indexOf(product.get('download').id)!==-1){
                        name = product.get('name');
                        url = product.get('views')[0].urls[0];
                        modelId = product.get('download').id;
                        color = product.get('color');
                        color = color.substring(1, color.length);
                        parameters = product.get('parameters');
                        _.each(_.keys(parameters), function(key){
                            if(parameters[key].selected){
                                band = key;
                            }
                        });

                        style = parameters[band].colorscale;
                        range = parameters[band].range;
                        logarithmic = parameters[band].logarithmic;

                        if(this.FLCollection.hasOwnProperty( name )) {
                            this.map.scene.primitives.remove(this.FLCollection[name]);
                            delete this.FLCollection[name];
                        }

                        if(band !== 'Fieldlines'){
                            return;
                        }

                        var that = this;

                        if(product.get('download').id === 'Magnetic_Model'){
                            modelId = 'Magnetic_Model=' + product.get('model_expression');
                        }

                        var options = {
                            'model_ids': modelId,
                            'begin_time': getISODateTimeString(this.beginTime),
                            'end_time': getISODateTimeString(this.endTime),
                            'bbox': this.bboxsel[0] +','+ this.bboxsel[1] +','+
                                    this.bboxsel[2] +','+ this.bboxsel[3],
                            'style': style,
                            'range_min': range[0],
                            'range_max': range[1],
                            'log_scale': logarithmic
                        };

                        if(product.get('download').id === 'Magnetic_Model'){
                            if(product.get('shc') !== null && product.get('model_expression').indexOf('Custom_Model')!==-1){
                                options.shc = product.get('shc');
                            }
                        }

                        $.post( url, tmplGetFieldLines(options))
                        .done(function( data ) {
                            Papa.parse(data, {
                                header: true,
                                dynamicTyping: true,
                                complete: function(results) {
                                    that.createPrimitives(results, name);
                                }
                            });
                        });
                    }
                }, this);
            }else{
                _.each(_.keys(this.FLCollection), function(key){
                    this.map.scene.primitives.remove(this.FLCollection[key]);
                    delete this.FLCollection[key];
                }, this);
            }
        },

        onFieldlinesChanged: function(){
            this.checkFieldLines();
        },

        createPrimitives: function(results, name){
            var parseddata = {};
            var instances = [];
            if(this.FLCollection.hasOwnProperty(name)){
                this.map.scene.primitives.remove(this.FLCollection[name]);
            }
            _.each(results.data, function(row){
                if(parseddata.hasOwnProperty(row.id)){
                    parseddata[row.id].colors.push(Cesium.Color.fromBytes(
                        row.color_r, row.color_g, row.color_b, 255)
                    );
                    parseddata[row.id].positions.push(new Cesium.Cartesian3(
                        row.pos_x, row.pos_y, row.pos_z)
                    );
                }else{
                    parseddata[row.id] = {
                        colors:[Cesium.Color.fromBytes(
                            row.color_r, row.color_g, row.color_b, 255
                        )],
                        positions:[new Cesium.Cartesian3(
                            row.pos_x, row.pos_y, row.pos_z)
                        ]
                     };
                }
            });
            var linecnt = 0;
            _.each(_.keys(parseddata), function(key){
                instances.push(
                    new Cesium.GeometryInstance({
                        geometry : new Cesium.PolylineGeometry({
                            positions : parseddata[key].positions,
                            width : 2.0,
                            vertexFormat : Cesium.PolylineColorAppearance.VERTEX_FORMAT,
                            colors : parseddata[key].colors,
                            colorsPerVertex : true,
                        }),
                        id: 'vec_line_'+linecnt
                    })
                );
                linecnt++;
            }, this);
            // TODO: Possibly needed geometry instances if transparency should work for fieldlines
            this.FLCollection[name] = new Cesium.Primitive({
                geometryInstances: instances,
                appearance: new Cesium.PolylineColorAppearance()
            });
            this.map.scene.primitives.add(this.FLCollection[name]);
        },

        onHighlightPoint: function(coords){
            this.billboards.removeAll();
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

            this.billboards.add({
                imageId : 'custom canvas point',
                image : canvas,
                position : Cesium.Cartesian3.fromDegrees(coords[1], coords[0], parseInt(coords[2]-6384100)),
                radius: coords[2],
                scale : 1
            });
        },

        onRemoveHighlights: function(){
            this.billboards.removeAll();
        },

        onTimeChange: function (time) {
            var string = getISODateTimeString(time.start) + '/'+ 
                         getISODateTimeString(time.end);
            this.beginTime = time.start;
            this.endTime = time.end;
            globals.products.each(function(product) {

                if(product.get('timeSlider')){
                    // Check if product contains shc file, if yes we need
                    // to switch to wps for visualization
                    if(this.checkComposedForSHC(product)){
                        this.loadShc(product, product.get('visible'));
                    } else {
                        product.set('time',string);
                        var cesLayer = product.get('ces_layer');
                        if(cesLayer && 
                           (typeof cesLayer.imageryProvider.updateProperties === 'function') ){
                            cesLayer.imageryProvider.updateProperties('time', string);
                            if (cesLayer.show){
                                var index = this.map.scene.imageryLayers.indexOf(cesLayer);
                                this.map.scene.imageryLayers.remove(cesLayer, false);
                                this.map.scene.imageryLayers.add(cesLayer, index);
                            }
                        }
                    }
                }
            }, this);
            this.checkFieldLines();
        },

        onSetExtent: function(bbox) {
            //this.map.zoomToExtent(bbox);
            /*this.map.scene.camera.flyToRectangle({
              destination: Cesium.Rectangle.fromDegrees(bbox[0], bbox[1], bbox[2], bbox[3])
            });*/
        },

        onChangeZoom: function (zoom) {
            if(zoom<0){
                this.map.scene.camera.zoomOut(Math.abs(zoom));
            }else{
                this.map.scene.camera.zoomIn(Math.abs(zoom));
            }
        },


        onClose: function(){
            this.isClosed = true;
        },

        isModelCompatible: function(model) {
            var protocol = model.get('view').protocol;
            if (protocol === 'WMS' || protocol === 'WMTS') {
                return true;
            }
            return false;
        },

        isEventListenedTo: function(eventName) {
            return !!this._events[eventName];
        },

        onLoadImage: function(url, selection_bounds){  
        },

        onSaveImage: function(){
            this.map.canvas.toBlob(function(blob) {
                saveAs(blob, 'VirES_Services_Screenshot.jpg');
            }, 'image/jpeg', 1);
        },

        onClearImage: function(){
            if(this.diffOverlay){
                this.map.removeLayer(this.diffOverlay);
                this.diffOverlay = null;
            }
        },


        handleTick: function(clock) {
            // TODO: Cesium does not provide a method to know when the camera has stopped, 
            //       this approach is not ideal, when the movement mantains inertia difference 
            //       values are very low and there are comparison errors.
            var c = this.map.scene.camera;
            var th = [10000, 10000, 10000];
            // If current mode is either Columbus or Scene2D lower threshold
            if(this.map.scene.mode === 1 || this.map.scene.mode === 2){
                th = [0, 0, 0];
            }
            if (!this.cameraIsMoving){
                if (Math.abs(this.cameraLastPosition.x - c.position.x) > th[0] &&
                    Math.abs(this.cameraLastPosition.y - c.position.y) > th[1] &&
                    Math.abs(this.cameraLastPosition.z - c.position.z) >= th[2] ){
                    this.cameraIsMoving = true;
                }
            }else{
                if (Math.abs(this.cameraLastPosition.x - c.position.x) <= th[0] &&
                    Math.abs(this.cameraLastPosition.y - c.position.y) <= th[1] &&
                    Math.abs(this.cameraLastPosition.z - c.position.z) <= th[2] ){
                    this.cameraIsMoving = false;
                    Communicator.mediator.trigger('map:position:change', this.getMapExtent() );
                    localStorage.setItem('cameraPosition', JSON.stringify({
                        position: [c.position.x, c.position.y,c.position.z],
                        direction: [c.direction.x, c.direction.y,c.direction.z],
                        up: [c.up.x, c.up.y,c.up.z],
                        right: [c.right.x, c.right.y,c.right.z]
                    }));
                }else{
                    this.cameraLastPosition.x = c.position.x;
                    this.cameraLastPosition.y = c.position.y;
                    this.cameraLastPosition.z = c.position.z;
                }
            }
        },

        wrapBbox: function(box) {
            // accepts bbox object{n:float, s:float, w:float, e:float} 
            // returns bbox with numeric values fit to (-180, 180, -90, 90), performing switching n->s and w->e if necessary
            // cant solve over-dateline jumps
          var bbox = _.clone(box);
          // switch north and south if necessary
          if (bbox.n < bbox.s){
              var temp = bbox.s;
              bbox.s = bbox.n;
              bbox.n = temp;
          }
          // fits to lat boundaries
          bbox.n = Math.min(bbox.n, 90);
          bbox.s = Math.max(bbox.s, -90);
          // fits to lon max boundaries if difference greater than 360
          if (bbox.e - bbox.w > 360){
              bbox.w = -180;
              bbox.e = 180;
          }
          // fits lon boundaries to -180,180 range
          _.each(bbox, function(coord, key, obj){
                while (coord > 180) {
                    coord -= 360;
                    obj[key] = coord;
                }
                while (coord < -180) {
                    coord += 360;
                    obj[key] = coord;
                }
          })
          // switch east and west if necessary
          if (bbox.e < bbox.w){
              var temp = bbox.e;
              bbox.e = bbox.w;
              bbox.w = temp;
          }
          return bbox;
        },

        submitCoordinateForms: function () {
            // coordinate form validation and event emitting
            var w = parseFloat($('#bboxWestForm').val().replace(',', '.'));
            var e = parseFloat($('#bboxEastForm').val().replace(',', '.'));
            var n = parseFloat($('#bboxNorthForm').val().replace(',', '.'));
            var s = parseFloat($('#bboxSouthForm').val().replace(',', '.'));
            if (!isNaN(w) && !isNaN(e) && !isNaN(n) && !isNaN(s) && w !== e && n !== s){
                // valid values inserted
                var bbox = {
                    "w" : w,
                    "e" : e,
                    "n" : n,
                    "s" : s,
                };
                // fix bbox if necessary
                var bboxFixed = this.wrapBbox(bbox);

                $("#bboxEditConfirm").removeClass("wrongBboxFormInput");
                $('.bboxEdit').addClass('hidden');
                Communicator.mediator.trigger('selection:changed', bboxFixed);
                Communicator.mediator.trigger('selection:activated', {
                    id:'bboxSelection',
                    active:false,
                    selectionType:'single'
                });
             } else {
                 // invalid input
                  $("#bboxEditConfirm").addClass("wrongBboxFormInput");
             }
        },

        cameraCustomZoomOnWheel: function (e){
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

        polarViewZoom: function(){
            $("#poleViewButton").text('Polar View');
            $(".poleButton").removeClass("viewActive");
            $("#poleViewButton").addClass("viewActive");
            this.map.scene.screenSpaceCameraController.enableRotate = false;
            this.map.scene.screenSpaceCameraController.enableTranslate = false;
            this.map.scene.screenSpaceCameraController.enableTilt = false;
            this.map.scene.screenSpaceCameraController.enableLook = false;
            this.map.scene.screenSpaceCameraController.enableZoom = false;

            $('.cesium-widget').off('wheel');
            $('.cesium-widget').on('wheel', function(e){
                this.cameraCustomZoomOnWheel(e);
            }.bind(this))
        },

        globalViewZoomReset: function(){
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

        bindPolarButtons: function() {
            $('.poleButton, #resetCameraView').off('click');
            // magnetic poles hardcoded as were in 1.1.2015 (igrf)
            $(".magN").click(function(){
                this.map.scene.camera.flyTo({
                    destination : Cesium.Cartesian3.fromDegrees(-84.551, 83.075, 10000000),
                    orientation : {
                        direction: new Cesium.Cartesian3(-0.011449873133578228, 0.12003352097560159, -0.9927038099289358),
                        up: new Cesium.Cartesian3(-0.2418134773341136, 0.9629699323710552, 0.11922731033143948)
                    },
                    complete : function(){
                        this.polarViewZoom();
                        $(".magN").addClass("viewActive");
                    }.bind(this)
                });
            }.bind(this));

            // magnetic poles hardcoded as were in 1.1.2015 (igrf)
            $(".magS").click(function(){
                this.map.scene.camera.flyTo({
                    destination : Cesium.Cartesian3.fromDegrees(125.738, -74.383, 10000000),
                    orientation : {
                        direction: new Cesium.Cartesian3(0.1572357407963758, -0.21851202199924571, 0.963083287186532),
                        up: new Cesium.Cartesian3(0.25309094759697687, -0.9337284667987544, -0.25317212037290326)
                    },
                    complete : function(){
                        this.polarViewZoom();
                        $(".magS").addClass("viewActive");
                    }.bind(this)
                });
            }.bind(this));

            $(".geoN").click(function(){
                this.map.scene.camera.flyTo({
                    destination : Cesium.Cartesian3.fromDegrees(0, 90, 10000000),
                    complete : function(){
                        this.polarViewZoom();
                        $(".geoN").addClass("viewActive");
                    }.bind(this)
                });
            }.bind(this));

            $(".geoS").click(function(){
                this.map.scene.camera.flyTo({
                    destination : Cesium.Cartesian3.fromDegrees(0, -90, 10000000),
                    complete : function(){
                        this.polarViewZoom();
                        $(".geoS").addClass("viewActive");
                    }.bind(this)
                });
            }.bind(this));

            $("#resetCameraView").click(function(){
                this.map.scene.camera.flyTo({
                    destination : Cesium.Rectangle.fromDegrees(-20.0, -15.0, 45.0, 60.0),
                    complete: this.globalViewZoomReset.bind(this)
                });
            }.bind(this));
        },

        toggleDebug: function(){
            this.map.scene.debugShowFramesPerSecond = !this.map.scene.debugShowFramesPerSecond;
        }
    });
    return CesiumView;
});
