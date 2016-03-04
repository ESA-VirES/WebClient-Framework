



define(['backbone.marionette',
		'communicator',
		'app',
		'models/MapModel',
		'globals',
		'papaparse',
		'hbs!tmpl/wps_load_shc',
		'hbs!tmpl/wps_calc_diff',
		'hbs!tmpl/wps_get_field_lines',
		'hbs!tmpl/wps_retrieve_swarm_features',
		'openlayers',
		'cesium/Cesium',
		'drawhelper',
		'filesaver'
	],
	function(Marionette, Communicator, App, MapModel, globals, Papa, Tmpl_load_shc, Tmpl_calc_diff, Tmpl_get_field_lines, Tmpl_retrive_swarm_features) {

		var CesiumView = Marionette.View.extend({

			model: new MapModel.MapModel(),

			initialize: function(options) {
				this.map = undefined;
				this.isClosed = true;
				this.tileManager = options.tileManager;
				this.selectionType = null;
				this.overlay_index = 99;
				this.diffimage_index = this.overlay_index-10;
				this.diff_overlay = null;
				this.overlay_layers = [];
				this.overlay_offset = 100;
				this.camera_is_moving = false;
				this.camera_last_position = null;
				this.billboards = null;
				this.activeFL = [];
				this.features_collection = {};
				this.FL_collection = {};
				this.bboxsel = null;
				this.extentPrimitive = null;
				this.activeModels = [];
				this.difference_image = null;

				this.begin_time = null;
				this.end_time = null;

				$(window).resize(function() {
					if (this.map) {
						this.onResize();
					}
				}.bind(this));

			},

			createMap: function() {

				// Problem arose in some browsers where aspect ratio was kept not adapting 
				// to height; Added height style attribute to 100% to solve problem
				this.$el.attr("style","height:100%;");

				// TODO: We dont use bing maps layer, but it still reports use of default key in console.
				// For now we just set it to something else just in case.
				Cesium.BingMapsApi.defaultKey = "NOTHING";

				Cesium.Camera.DEFAULT_VIEW_RECTANGLE = Cesium.Rectangle.fromDegrees(-5.0, -40.0, 40.0, 90.0);


				Cesium.WebMapServiceImageryProvider.prototype.updateProperties = function(property, value) {

			        property = "&"+property+"=";
			        value = ""+value;
			        var i = _.indexOf(this._tileProvider._urlParts, property);
			        if (i>=0){
			        	this._tileProvider._urlParts[i+1] = value;
			        }else{
			        	this._tileProvider._urlParts.push(property);
			        	this._tileProvider._urlParts.push(encodeURIComponent(value));
			        }
			    };

				this.$el.append("<div id='cesium_attribution'></div>");
				this.$el.append("<div id='cesium_custom_attribution'></div>");
				$("#cesium_custom_attribution").append("<div style='float:left'><a href='http://cesiumjs.org' target='_blank'>Cesium</a>"+
					"&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>");

				this.$el.append('<div style="position:absolute; right:46px; top:5px; height:32px; z-index:5;" type="button" class="btn btn-success" id="cesium_save">Save as Image</div>');

				var layer;
				var name = "";

				this.colors = globals.objects.get("color");

				globals.baseLayers.each(function(baselayer) {
					if (baselayer.get("visible")){
						name = baselayer.get("name");
						layer = this.createLayer(baselayer);
					}
				}, this);

				var clock = new Cesium.Clock({
				   startTime : Cesium.JulianDate.fromIso8601("2014-01-01"),
				   currentTime : Cesium.JulianDate.fromIso8601("2014-01-02"),
				   stopTime : Cesium.JulianDate.fromIso8601("2014-01-03"),
				   clockRange : Cesium.ClockRange.LOOP_STOP,
				   clockStep : Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER,
				   canAnimate: false,
				   shouldAnimate: false
				});

				if (layer){
					this.map = new Cesium.Viewer(this.el,
					{
						timeline: false,
						fullscreenButton: false,
						baseLayerPicker: false,
						homeButton: false,
						infoBox: false,
						navigationHelpButton: false,
						navigationInstructionsInitiallyVisible: false,
						animation: false,
						imageryProvider: layer,
						terrainProvider : new Cesium.CesiumTerrainProvider({
					        url : 'https://tiles.maps.eox.at/dem'
					    }),
						creditContainer: "cesium_attribution",
						contextOptions: {webgl: {preserveDrawingBuffer: true}},
						clock: clock
					});
				}

				var mm = globals.objects.get('mapmodel');

			    var canvas = this.map.canvas;

			    this.map.scene.skyBox.show = mm.get('skyBox');
			    this.map.scene.sun.show = mm.get('sun');
			    this.map.scene.moon.show = mm.get('moon');
			    this.map.scene.skyAtmosphere.show = mm.get('skyAtmosphere');
			    this.map.scene.backgroundColor = new Cesium.Color.fromCssColorString(mm.get('backgroundColor'));

			    // TODO: Removes fog for now as it is not very good at this point
			    if(this.map.scene.hasOwnProperty('fog')){
			      this.map.scene.fog.enabled = false;  
			    }

			    // Remove gazetteer field
			    $('.cesium-viewer-geocoderContainer').remove();

			    // Show Wireframe
			    //this.map.scene.globe._surface._tileProvider._debug.wireframe = true;
			    

				//this.map.scene.fxaaOrderIndependentTranslucency = false;


				this.billboards = this.map.scene.primitives.add(new Cesium.BillboardCollection());

				this.drawhelper = new DrawHelper(this.map.cesiumWidget);

				this.camera_last_position = {};
				this.camera_last_position.x = this.map.scene.camera.position.x;
				this.camera_last_position.y = this.map.scene.camera.position.y;
				this.camera_last_position.z = this.map.scene.camera.position.z;

				// Extend far clipping for fieldlines

				this.map.scene.camera.frustum.far = this.map.scene.camera.frustum.far * 15

				/*var maxRadii = this.map.scene.globe.ellipsoid.maximumRadius;

				var frustum = new Cesium.OrthographicFrustum();
				frustum.right = maxRadii * Cesium.Math.PI/2;
				frustum.left = -frustum.right;
				frustum.top = frustum.right * (this.map.scene.canvas.clientHeight / this.map.scene.canvas.clientWidth);
				frustum.bottom = -frustum.top;

				frustum.near = 0.01 * maxRadii;
				frustum.far = 50.0 * maxRadii;

				this.map.scene.camera.frustum = frustum;*/

				this.map.clock.onTick.addEventListener(this.handleTick.bind(this));
				
				globals.baseLayers.each(function(baselayer) {
					if (baselayer.get("name") == name){
						var ces_layer = this.map.scene.imageryLayers.get(0);
						ces_layer.show = true;
				 		baselayer.set("ces_layer", ces_layer);
					}
				}, this);

				/*
				this.colors = globals.objects.get("color");

				this.map.events.register("move", this.map, function(data) {
					//console.log(data.object.getCenter());
					var center = data.object.getCenter();
					this.model.set({
						'center': [center.lon, center.lat],
						'zoom': data.object.zoom
					});

					// We set a flag here so that other views have the possibility to check if there is a
					// map panning going on at the moment. This is important e.g. for the VGV to prevent
					// sending a 'pan' event in some cases which would lead to a infinite recursion.
					App.isMapPanning = true;
				}.bind(this));

				
				this.map.events.register("moveend", this.map, function(data) {
					// See lines above for an explanation of that flag:
					App.isMapPanning = false;
					Communicator.mediator.trigger("map:position:change", this.map.getExtent());				
				}.bind(this));
				*/
				
				//Go through all defined baselayer and add them to the map
				globals.baseLayers.each(function(baselayer) {
					if (baselayer.get("name")!=name){
						var layer = this.createLayer(baselayer);
						if (layer) {
							var imagerylayer = this.map.scene.imageryLayers.addImageryProvider(layer);
							imagerylayer.show = baselayer.get("visible");
							baselayer.set("ces_layer", imagerylayer);
						}
					}
				}, this);

				
				// Go through all products and add them to the map
				_.each(globals.products.last(globals.products.length).reverse(), function(product){
					var layer = this.createLayer(product);
					if (layer) {
						var imagerylayer = this.map.scene.imageryLayers.addImageryProvider(layer);
						product.set("ces_layer", imagerylayer);
						imagerylayer.show = product.get("visible");
						imagerylayer.alpha = product.get("opacity");


						// If product protocol is not WMS or WMTS they are shown differently so dont activate "dummy" layers
						if(product.get("views")[0].protocol != "WMS" && product.get("views")[0].protocol != "WMTS")
							imagerylayer.show = false;

						// If the product is set to visible trigger its activation event which handles all protocols
						if(product.get("visible")){
							var options = { name: product.get('name'), isBaseLayer: false, visible: true };
							// TODO: products made active from config are not working correctly
							// The timeslider view is initialized afterwards and the product is not displayed

							//Communicator.mediator.trigger('timeslider:add:layer', options);
						}
					}
				}, this);

				// Go through all overlays and add them to the map
                globals.overlays.each(function(overlay){
                	var layer = this.createLayer(overlay);
					if (layer) {
						var imagerylayer = this.map.scene.imageryLayers.addImageryProvider(layer);
						//var index = this.map.scene.imageryLayers.indexOf(imagerylayer);
						//index += this.overlay_offset;
						this.map.scene.imageryLayers.remove(imagerylayer, false);
						imagerylayer.show = overlay.get("visible");
						this.map.scene.imageryLayers.add(imagerylayer);
						overlay.set("ces_layer", imagerylayer);
					}
                }, this);

			},

			onShow: function() {
				if (!this.map) {
					this.createMap();
				}
				
				this.isClosed = false;
				$("#cesium_save").on("click", this.onSaveImage.bind(this));
				//this.onResize();
				return this;
			},

			onResize: function() {
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

                var return_layer = null;
                var views = layerdesc.get('views');
                var view = undefined;

                if( typeof(views) == 'undefined'){
	                view = layerdesc.get('view');
	            } else {
	            	
	            	if (views.length == 1){
	                	view = views[0];
	                } else {
                		// FIXXME: this whole logic has to be replaced by a more robust method, i.e. a viewer
                		// defines, which protocols to support and get's the corresponding views from the
                		// config then.

                		// For now: prefer WMTS over WMS, if available:
                		var wmts = _.find(views, function(view){ return view.protocol == "WMTS"; });
                		if(wmts){
                			view = wmts;
                		} else {
                			var wms = _.find(views, function(view){ return view.protocol == "WMS"; });
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
	            if(layerdesc.get("visible")){
	            	if(view.attribution){
	            		$("#cesium_custom_attribution").append(
		            		"<div id='" + layerdesc.get("name") + "' style='float: left;'>"+
		            		view.attribution +
		            		"</div>");
	            	}
	            }
	            
                switch(view.protocol){
                    case "WMTS":
                    	return_layer = new Cesium.WebMapTileServiceImageryProvider({
						    url : view.urls[0],
						    layer : view.id,
						    style : view.style,
						    format : view.format,
						    tileMatrixSetID : view.matrixSet,
						    maximumLevel: 12,
						    tilingScheme: new Cesium.GeographicTilingScheme({numberOfLevelZeroTilesX: 2, numberOfLevelZeroTilesY: 1}),
						    credit : new Cesium.Credit(view.attribution),
						    show: layerdesc.get("visible")
						});
                    break;

                    case "WMS":
                    	params = $.extend({
                    		time: layerdesc.get("time"),
                    		transparent: 'true'
                    	},  Cesium.WebMapServiceImageryProvider.DefaultParameters)

                    	// Check if layer has additional parameters configured
                    	var additional_parameters = {};
                    	var styles;
                    	if(layerdesc.get("parameters")){
                    		var options = layerdesc.get("parameters");
                    		var keys = _.keys(options);
                    		_.each(keys, function(key){
								if(options[key].selected){
									//additional_parameters.dim_bands = key;
									additional_parameters.dim_range = options[key].range[0]+","+options[key].range[1];
									styles = options[key].colorscale;
								}
							});
                    	}
                    	params = $.extend(additional_parameters, params);
                    	params.styles = styles; 

                    	if(layerdesc.get("height")){
	                    	params.elevation = layerdesc.get("height");
	                    }

                    	params.format = 'image/png';
                    	return_layer = new Cesium.WebMapServiceImageryProvider({
						    url: view.urls[0],
						    layers : view.id,
						    parameters: params
						});

                    break;

                    default:
                    	// No supported view available
                    	// Return dummy Image provider to help with with sorting of layers 
                    	//return  new Cesium.WebMapServiceImageryProvider();
                    	return false;
                    break;

                };

                /*return_layer.events.register("loadstart", this, function() {
                  	Communicator.mediator.trigger("progress:change", true);
                });
                
                return_layer.events.register("loadend", this, function() {
                  	Communicator.mediator.trigger("progress:change", false);
                });*/
                return return_layer;                
            },

			centerMap: function(data) {
				this.map.setCenter(new OpenLayers.LonLat(data.x, data.y), data.l);

				this.model.set({
					'center': [data.x, data.y],
					'zoom': data.l
				});
			},

			onSortProducts: function(productLayers) {


				// Search for moved layer
				var layer_moved = null;
				var to_move = 0;
				globals.products.each(function(product) {
					var ces_layer = product.get("ces_layer");
                	if (ces_layer){
                		var product_index = (globals.products.length-1 - globals.products.indexOf(product)) + globals.baseLayers.length;
                		var ces_index = this.map.scene.imageryLayers.indexOf(ces_layer);
                		var cur_move = product_index - ces_index;
                		if (Math.abs(to_move)<Math.abs(cur_move)){
                			to_move = cur_move;
                			layer_moved = ces_layer;
                		}
                	}
				}, this);

				// Raise or Lower the layer depending on movement
				for(var i=0; i<Math.abs(to_move); ++i){
					if(to_move < 0)
						this.map.scene.imageryLayers.lower(layer_moved);
					else if(to_move>0)
						this.map.scene.imageryLayers.raise(layer_moved);
				}

				
				console.log("Map products sorted");
			},

			onUpdateOpacity: function(options) {
				//var ces_layer = options.model.get("ces_layer");
				globals.products.each(function(product) {
                	if(product.get("name")==options.model.get("name")){
                		var ces_layer = product.get("ces_layer");

                		if( _.has(this.features_collection, options.model.get("views")[0].id) ){
                			var fc = this.features_collection[options.model.get("views")[0].id];
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
                			};
                		}else if(ces_layer){
							ces_layer.alpha = options.value;
						}
					}
				}, this);
                /*var layer = this.map.getLayersByName(options.model.get("name"))[0];
                if (layer){
                        layer.setOpacity(options.value);
                }*/
            },

            changeLayer: function(options) {
            	// Seems for some reason that a layer needs to be as shown at all times
            	// or cesium will throw an error, so first activate the new layer, then 
            	// deactivate the others
				if (options.isBaseLayer){
					
					globals.baseLayers.each(function(baselayer) {
						var ces_layer = baselayer.get("ces_layer");
						if (ces_layer) {
							if(baselayer.get("name")==options.name){
								ces_layer.show = true;
								// Manage custom attribution element (add attribution for active baselayer)
				            	if(baselayer.get("views")[0].attribution){
				            		$("#cesium_custom_attribution").append(
					            		"<div id='" + baselayer.get("name") + "' style='float: left;'>"+
					            		baselayer.get("views")[0].attribution +
					            		"</div>");
					            }
							}
						}
					}, this);

					globals.baseLayers.each(function(baselayer) {
						var ces_layer = baselayer.get("ces_layer");
						if (ces_layer) {
							if(baselayer.get("name")!=options.name){
								ces_layer.show = false;
								//Manage custom attribution (remove deactivated layers)
								$("#"+baselayer.get("name")).remove();
							}
						}
					}, this);

                } else {
                    globals.overlays.each(function(overlay) {
                    	if(overlay.get("name")==options.name){
                    		var ces_layer = overlay.get("ces_layer");
							ces_layer.show = options.visible;
							if(options.visible){
								// Manage custom attribution element (add attribution for active baselayer)
				            	if(overlay.get("view").attribution){
				            		$("#cesium_custom_attribution").append(
					            		"<div id='" + overlay.get("name") + "' style='float: left;'>"+
					            		overlay.get("view").attribution +
					            		"</div>");
					            }
							}else{
								//Manage custom attribution (remove deactivated layers)
								$("#"+overlay.get("name")).remove();
							}
						}
					}, this);

					globals.products.each(function(product) {
                    	if(product.get("name")==options.name){
                    		// TODO: This if method is only for testing and has to be reviewed
                    		if(product.get("views")[0].protocol == "CZML"){
                    			this.checkLayerFeatures(product, options.visible);

			        		}else if (product.get("views")[0].protocol == "FL_CZML"){
			        			/*if(options.visible){
			        				//product.set("visible", true);
	                    			this.activeFL.push(product.get("name"));
	                    		}else{
	                    			if (this.activeFL.indexOf(product.get('name'))!=-1){
	                    				//TODO: Remove possibly loaded entity
                						this.activeFL.splice(this.activeFL.indexOf(product.get('name')), 1);
                					}

	                    		}
	                    		this.checkFieldLines();*/
							
                    		}else if (product.get("views")[0].protocol == "WPS"){
                    			this.checkShc(product, options.visible);
								
                    		}else if (product.get("views")[0].protocol == "WMS" || product.get("views")[0].protocol == "WMTS" ){

                    			var parameters = product.get("parameters");
                    			var coeff_range = product.get("coefficients_range");

                    			if (parameters){
                    				var band;
			            			var keys = _.keys(parameters);
									_.each(keys, function(key){
										if(parameters[key].selected)
											band = key;
									});
			            			var style = parameters[band].colorscale;
			            			var range = parameters[band].range;

									if (band == "Fieldlines"){
										if(options.visible){
			                    			this.activeFL.push(product.get("name"));
			                    		}else{
			                    			if (this.activeFL.indexOf(product.get('name'))!=-1){
		                						this.activeFL.splice(this.activeFL.indexOf(product.get('name')), 1);
		                					}
			                    		}
			                    		this.checkFieldLines();
									}else{
										var ces_layer = product.get("ces_layer");
										if(band)
					                		ces_layer.imageryProvider.updateProperties("dim_bands", band);
					                	if(range)
					                		ces_layer.imageryProvider.updateProperties("dim_range", (range[0]+","+range[1]));
					                	if(style)
					                		ces_layer.imageryProvider.updateProperties("styles", style);
					                	if(coeff_range)
					                		ces_layer.imageryProvider.updateProperties("dim_coeff", (coeff_range[0]+","+coeff_range[1]));

										ces_layer.show = options.visible;
									}
                    			}else{
                    				var ces_layer = product.get("ces_layer");
									ces_layer.show = options.visible;
                    			}
                    			

	                    		
							}
							if(options.visible){
								// Manage custom attribution element (add attribution for active baselayer)
				            	if(product.get("views")[0].attribution){
				            		$("#cesium_custom_attribution").append(
					            		"<div id='" + product.get("name") + "' style='float: left;'>"+
					            		product.get("views")[0].attribution +
					            		"</div>");
					            }
							}else{
								//Manage custom attribution (remove deactivated layers)
								$("#"+product.get("name")).remove();
							}
						}
						if(product.get("model") && product.get("name") == options.name){
							if(options.visible){
								this.activeModels.push(product.get("name"));
								// Iterate over active Swarm products
								globals.products.each(function(product) {
									if(product.get("satellite") == "Swarm")
										this.checkLayerFeatures(product, product.get("visible"));
								},this);
							}else{
								if (this.activeModels.indexOf(product.get('name'))!=-1)
                					this.activeModels.splice(this.activeModels.indexOf(product.get('name')), 1);

                				if (this.activeModels.length != 2){
                					if(this.difference_image)	
										this.map.scene.imageryLayers.remove(this.difference_image);
									this.difference_image = null;

									if($("#colorlegend").is(":visible"))
										$("#colorlegend").hide();
                				}

							}

							// Compare models if two are selected
							if (this.activeModels.length == 2){

								var that = this;

								var model1 = _.find(globals.products.models, function(p){return p.get("name") == that.activeModels[0];});
								var model2 = _.find(globals.products.models, function(p){return p.get("name") == that.activeModels[1];});

								var url = model2.get("views")[0].urls[0];

								var models = [model1.get("views")[0].id, model2.get("views")[0].id];

								var shc = null;

								// Remove custom model with id shc if selected
								if (models.indexOf("shc")!=-1){
									shc = _.find(globals.products.models, function(p){return p.get("shc") != null;}).get("shc");
			    					models.splice(models.indexOf("shc"), 1);
			    				}

								models = models.join(",");

								var parameters = product.get("parameters");
	                			var band;

	                			var keys = _.keys(parameters);
								_.each(keys, function(key){
									if(parameters[key].selected)
										band = key;
								});
	                			var style = parameters[band].colorscale;
	                			var height = product.get("height");
	                			var uom = parameters[band].uom;

            					var imageURI;

								$.post( url, Tmpl_calc_diff({
									"model_ids": models,
									"shc": shc,
									"begin_time": getISODateTimeString(this.begin_time),
									"end_time": getISODateTimeString(this.end_time),
									//"band": band,
									"style": style,
									"height": height
								}), "xml")

									.done(function( data ) {

										// Remove previous and add colorlegend to cesium view
										$("#colorlegend").remove();
										$(".cesium-viewer").append('<div id="colorlegend"></div>');

										data = $.parseXML(data);
										if(that.difference_image)	
											that.map.scene.imageryLayers.remove(that.difference_image);

										var img64 = $(data.getElementsByTagName("ComplexData")).text();
									    imageURI = "data:image/gif;base64,"+img64;
									    var prov = new Cesium.SingleTileImageryProvider({url: imageURI});
										that.difference_image = that.map.scene.imageryLayers.addImageryProvider(prov);
										that.map.scene.imageryLayers.lower(that.difference_image);

										var style = $(data.getElementsByTagName("LiteralData")).text().split(",");


										
										var margin = 20;
										var width = $("#colorlegend").width();
										var scalewidth =  width - margin *2;
										console.log(width);

										
										$("#colorlegend").append(
											'<div class="'+style[0]+'" style="width:'+scalewidth+'px; height:20px; margin-left:'+margin+'px"></div>'
										);

										var svgContainer = d3.select("#colorlegend").append("svg")
											.attr("width", width)
											.attr("height", 60);


										var axisScale = d3.scale.linear();

										axisScale.domain([parseFloat(style[1]), parseFloat(style[2])]);
										axisScale.range([0, scalewidth]);

										var xAxis = d3.svg.axis()
											.scale(axisScale);


										xAxis.tickValues( axisScale.ticks( 5 ).concat( axisScale.domain() ) );
										xAxis.tickFormat(d3.format('.02f'));


									    svgContainer.append("g")
									        .attr("class", "x axis")
									        .attr("transform", "translate(" + [margin, 3]+")")
									        .call(xAxis)
									        .append("text")
												.style("text-anchor", "middle")
												.style("font-size", "1.1em")
												.attr("transform", "translate(" + [scalewidth/2, 40]+")")
												.text(uom);

										$("#colorlegend").show();

									});
							}

						}
					}, this);
                }



            },


            checkShc: function(product, visible){
            	if(visible){

    				if(product.get('shc') != null){

    					var parameters = product.get("parameters");
            			var band;
            			var keys = _.keys(parameters);
						_.each(keys, function(key){
							if(parameters[key].selected)
								band = key;
						});
            			var style = parameters[band].colorscale;
            			var range = parameters[band].range;
    					var imageURI;
						var that = this;
						var imagelayer;

						var ces_layer = product.get("ces_layer");
						var index = this.map.scene.imageryLayers.indexOf(ces_layer);
						
						var url = product.get("views")[0].urls[0];

						var coefficients_range = product.get("coefficients_range");

						$.post( url, Tmpl_load_shc({
							"shc":product.get('shc'),
							"begin_time": getISODateTimeString(this.begin_time),
							"end_time": getISODateTimeString(this.end_time),
							"band": band,
							"style": style,
							"range_min": range[0],
							"range_max": range[1],
							"height": product.get("height"),
							"coefficients_range": coefficients_range.join()
						}))

							.done(function( data ) {	
								that.map.scene.imageryLayers.remove(ces_layer);									
							    imageURI = "data:image/gif;base64,"+data;
							    var imagelayer = new Cesium.SingleTileImageryProvider({url: imageURI});
								ces_layer = that.map.scene.imageryLayers.addImageryProvider(imagelayer, index);
								product.set("ces_layer", ces_layer);
								// TODO: Hack to position layer at correct index, adding imagery provider  
								// with index does not seem to be working
								var ces_index = that.map.scene.imageryLayers.indexOf(ces_layer);
								var to_move = index - ces_index;
								for(var i=0; i<Math.abs(to_move); ++i){
									if(to_move < 0)
										that.map.scene.imageryLayers.lower(ces_layer);
									else if(to_move>0)
										that.map.scene.imageryLayers.raise(ces_layer);
								}
							});
    				}
    			}else{
    				var ces_layer = product.get("ces_layer");
					ces_layer.show = visible;
    			}
            },


            checkLayerFeatures: function (product, visible) {

				var id = product.get("views")[0].id;

				if(this.features_collection.hasOwnProperty(id)){
            		this.map.scene.primitives.remove(this.features_collection[id]);
            		delete this.features_collection[id];
            	}

            	if(visible){
					var color = product.get("color");
					color = color.substring(1, color.length);

	    			var parameters = product.get("parameters");
	    			var keys = _.keys(parameters);
	    			var band;
					_.each(keys, function(key){
						if(parameters[key].selected)
							band = key;
					});
	    			var style = parameters[band].colorscale;
	    			var outlines = product.get("outlines");
	    			var range = parameters[band].range;
	    			var alpha = product.get("opacity");
	    			var url = product.get("views")[0].urls[0];

	            	var that = this;

	            	$.post( url, Tmpl_retrive_swarm_features({
						//"shc": product.get('shc'),
						"model_ids": this.activeModels.join(),
						"collection_id": id,
						"begin_time": getISODateTimeString(this.begin_time),
						"end_time": getISODateTimeString(this.end_time),
						"band": band,
						"alpha": alpha,
						//"bbox": this.bboxsel[0] +","+ this.bboxsel[1] +","+ this.bboxsel[2] +","+ this.bboxsel[3],
						"style": style,
						"dim_range": (range[0]+","+range[1]),
					}))

					.done(function( data ) {
						Papa.parse(data, {
							header: true,
							dynamicTyping: true,
							complete: function(results) {
								that.createFeatures(results, id, band, alpha)
							}
						});
					});
				}
               
            },

            createFeatures: function (results, identifier, band, alpha){

            	// The feature collection is removed directly when a change happens
            	// because of the asynchronous behavior it can happen that a collection
            	// is added between removing it and adding another one so here we make sure
            	// it is empty before overwriting it, which would lead to a not referenced
            	// collection which is no longer deleted.
            	// I remove it before the response because a direct feedback to the user is important
            	// There is probably a cleaner way to do this
            	if(this.features_collection.hasOwnProperty(identifier)){
            		this.map.scene.primitives.remove(this.features_collection[identifier]);
            		delete this.features_collection[identifier];
            	}

				if(band == "B_NEC"){

					this.features_collection[identifier] = new Cesium.PrimitiveCollection();
					

					_.each(results.data, function(row){

						var arrowmat = 	new Cesium.Material.fromType('PolylineArrow');			
						arrowmat.uniforms.color = Cesium.Color.fromBytes(row.col_r, row.col_g, row.col_b, alpha*255);

						this.features_collection[identifier].add(new Cesium.Primitive({
						    geometryInstances : new Cesium.GeometryInstance({
						        geometry : new Cesium.PolylineGeometry({
						            positions : [
							            new Cesium.Cartesian3(row.pos1_x, row.pos1_y, row.rad1),
							            new Cesium.Cartesian3(row.pos2_x, row.pos2_y, row.rad2)
						            ],
						            width : 5.0,
						            vertexFormat : Cesium.PolylineMaterialAppearance.VERTEX_FORMAT,
						        })
						    }),
						    //appearance : new Cesium.PolylineColorAppearance()
						    appearance : new Cesium.PolylineMaterialAppearance({
						    	material : arrowmat
						  	})
						}));

					}, this);

					// TODO: Explored increasing performance using color instance attribute
					//  Was not able to make it work with materials, maybe there is a solution
					/*
					var instances = [];
					_.each(results.data, function(row){
						instances.push(
							new Cesium.GeometryInstance({
						        geometry : new Cesium.PolylineGeometry({
						            positions : [
							            new Cesium.Cartesian3(row.pos1_x, row.pos1_y, row.rad1),
							            new Cesium.Cartesian3(row.pos2_x, row.pos2_y, row.rad2)
						            ],
						            width : 5.0,
						            vertexFormat : Cesium.PolylineMaterialAppearance.VERTEX_FORMAT,
						        }),
						        attributes: {
						        	color: new Cesium.ColorGeometryInstanceAttribute(row.col_r/255, row.col_g/255, row.col_b/255, alpha)
						        }
						    })
					    );	

					}, this);

					this.features_collection[identifier].add(new Cesium.Primitive({
					    geometryInstances : instances,
					    appearance : new Cesium.PolylineColorAppearance()
					}));
					*/


	        		this.map.scene.primitives.add(this.features_collection[identifier]);

				}else{


					this.features_collection[identifier] = new Cesium.PointPrimitiveCollection();

				    _.each(results.data, function(row){
				    	var color = Cesium.Color.fromBytes(row.col_r, row.col_g, row.col_b, alpha*255);
						this.features_collection[identifier].add({
					        position : new Cesium.Cartesian3(row.pos_x, row.pos_y, row.rad),
					        //outlineWidth: 1,
					        //outlineColor: color,
					        //scaleByDistance: new Cesium.NearFarScalar(1.5e2, 10, 15.0e6, 0.5),
					        color : color,
					        pixelSize : 8
					    });

					}, this);

					this.map.scene.primitives.add(this.features_collection[identifier]);

				}

        		
            },

            OnLayerParametersChanged: function(layer){
            	globals.products.each(function(product) {

            		if(product.get("name")==layer){

            			var hexcolor = product.get("color");
	                		hexcolor = hexcolor.substring(1, hexcolor.length);
            			var parameters = product.get("parameters");
            			var band;
            			var keys = _.keys(parameters);
						_.each(keys, function(key){
							if(parameters[key].selected)
								band = key;
						});
            			var style = parameters[band].colorscale;
            			var range = parameters[band].range;
            			var outlines = product.get("outlines");
            			var height = product.get("height");

            			var coeff_range = product.get("coefficients_range");

						if(product.get("views")[0].protocol == "CZML"){
							this.checkLayerFeatures(product, product.get("visible"));

	                	}else if(product.get("views")[0].protocol == "WMS"){

	                		if (band == "Fieldlines" ){
								if(product.get("visible")){
									var ces_layer = product.get("ces_layer");
									this.map.scene.imageryLayers.remove(ces_layer, false);

									// When changing height or coefficient range and fieldlienes is selected
									// model would be added multiple times, need to check if model already 
									// marked as active and avoid adding it to list
									if (this.activeFL.indexOf(product.get('name'))==-1)
	                    				this.activeFL.push(product.get("name"));

	                    		}else{
	                    			if (this.activeFL.indexOf(product.get('name'))!=-1){
                						this.activeFL.splice(this.activeFL.indexOf(product.get('name')), 1);
                					}
	                    		}
	                    		this.checkFieldLines();
							}else{
								if (this.activeFL.indexOf(product.get('name'))!=-1){
            						this.activeFL.splice(this.activeFL.indexOf(product.get('name')), 1);
            					}
            					this.checkFieldLines();
								if(product.get("name")==layer){
				                	var ces_layer = product.get("ces_layer");

				                	ces_layer.imageryProvider.updateProperties("dim_bands", band);

				                	ces_layer.imageryProvider.updateProperties("dim_range", (range[0]+","+range[1]));

				                	ces_layer.imageryProvider.updateProperties("elevation", height);

				                	if(style)
				                		ces_layer.imageryProvider.updateProperties("styles", style);
				                	if(coeff_range)
					        			ces_layer.imageryProvider.updateProperties("dim_coeff", (coeff_range[0]+","+coeff_range[1]));

				                	if (ces_layer.show){
					            		var index = this.map.scene.imageryLayers.indexOf(ces_layer);
					            		this.map.scene.imageryLayers.remove(ces_layer, false);
					            		this.map.scene.imageryLayers.add(ces_layer, index);
					            	}
					            }
							}
				        }else if (product.get("views")[0].protocol == "WPS"){
							this.checkShc(product, product.get("visible"));
						}
				    }
                    
	            }, this);
            },


			onExportGeoJSON: function() {
				var geojsonstring = this.geojson.write(this.vectorLayer.features, true);

				var blob = new Blob([geojsonstring], {
					type: "text/plain;charset=utf-8"
				});
				saveAs(blob, "selection.geojson");
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
			        if (center != null){
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

            onSelectionActivated: function(arg) {
				this.selectionType = arg.selectionType;

				if (arg.active) {

					var that = this;
					this.drawhelper.startDrawingExtent({
	                    callback: function(extent) {

				            /*console.log('Extent created (N: ' + extent.north.toFixed(3) +
				            			 ', E: ' + extent.east.toFixed(3) + 
				            			 ', S: ' + extent.south.toFixed(3) +
				            			 ', W: ' + extent.west.toFixed(3) + ')');*/

							//var colorindex = that.map.scene.primitives.length+1;
							var colorindex = 0;
							if(that.selectionType == "single"){
								//that.map.scene.primitives.removeAll();
								colorindex = that.map.scene.primitives.length;
								Communicator.mediator.trigger("selection:changed", null);
							}

							//var color = that.colors(colorindex);
							var color = null;

							//Communicator.mediator.trigger("selection:changed", evt.feature);
							// MH: this is a hack: I send the openlayers AND the coords so that the viewers (RBV, SliceViewer) do
							// not have to be rewritten. This has to be changed somewhen...
							var coordinates = that._convertCoordsFromCesium(extent, 0);
							var feature = that._convertCoordsToOpenLayers(coordinates);
							Communicator.mediator.trigger("selection:changed", feature, coordinates, color);
	                    }
	                });

					/*for (key in this.drawControls) {
						var control = this.drawControls[key];
						if (arg.id == key) {
							control.activate();
						} else {
							control.layer.removeAllFeatures();
							control.deactivate();
							Communicator.mediator.trigger("selection:changed", null);
						}
					}*/
				} else {
					//this.map.scene.primitives.removeAll();
					Communicator.mediator.trigger("selection:changed", null);
					//this.drawhelper.muteHandlers(true);
					//this.map.screenSpaceEventHandler.destroy();
					this.drawhelper.stopDrawing();
					/*for (key in this.drawControls) {
						var control = this.drawControls[key];
						control.layer.removeAllFeatures();
						control.deactivate();
						Communicator.mediator.trigger("selection:changed", null);

					}*/
				}
			},
           

			onSelectionChanged: function(feature, coords, color){

				if(coords){
					// TODO: Color index is needed for multiple selections
					// this feature is not used in VirES and deactivated right now
					// as the colorindex is not correctly implemented
					// Need to look into this code

					/*var colorindex = this.map.scene.primitives.length+1;
					if(this.selectionType == "single"){
						if (this.extentPrimitive)
							this.map.scene.primitives.remove(this.extentPrimitive);
						if(this.FL_czml_src)
							this.map.dataSources.remove(this.FL_czml_src);

						colorindex = this.map.scene.primitives.length;
					}

					if(!color)
						color = this.colors(colorindex);*/

					var color = "#6699FF";

					var material = Cesium.Material.fromType('Color');
					material.uniforms.color = new Cesium.Color.fromCssColorString(color);
					material.uniforms.color.alpha = 0.6;

					var e = new Cesium.Rectangle();

			        e.west = Cesium.Math.toRadians(coords[0].x);
			        e.east = Cesium.Math.toRadians(coords[2].x);
			        e.south = Cesium.Math.toRadians(coords[0].y);
			        e.north = Cesium.Math.toRadians(coords[2].y);

			        this.bboxsel = [coords[0].y, coords[0].x, coords[2].y, coords[2].x ];

		            this.extentPrimitive = new DrawHelper.ExtentPrimitive({
		                extent: e,
		                material: material
		            });

		            this.map.scene.primitives.add(this.extentPrimitive);

		            this.checkFieldLines();
		            


				}else{
					this.bboxsel = null;
					if(this.extentPrimitive)
						this.map.scene.primitives.remove(this.extentPrimitive);
					_.each(_.keys(this.FL_collection), function(key){
	            		this.map.scene.primitives.remove(this.FL_collection[key]);
                		delete this.FL_collection[key];
	            	}, this);
				}


			},

			checkFieldLines: function(){
				console.log(this.activeFL);

				if(this.activeFL.length>0 && this.bboxsel){

	            	var url, model_id, color, band, style, range, logarithmic;

	            	globals.products.each(function(product) {
                		if(this.activeFL.indexOf(product.get('name'))!=-1){
                			var name = product.get('name');
                			url = product.get("views")[0].urls[0];
                			model_id = product.get("views")[0].id;
                			color = product.get("color");
	                		color = color.substring(1, color.length);
	            			parameters = product.get("parameters");
	            			band;
							_.each(_.keys(parameters), function(key){
								if(parameters[key].selected)
									band = key;
							});
	            			style = parameters[band].colorscale;
	            			range = parameters[band].range;
	            			logarithmic = parameters[band].logarithmic;

	            			if(this.FL_collection.hasOwnProperty( name )) {
		                		this.map.scene.primitives.remove(this.FL_collection[name]);
		                		delete this.FL_collection[name];
		                	}

		                	var that = this;

		                	$.post( url, Tmpl_get_field_lines({
								//"shc": product.get('shc'),
								"model_ids": model_id,
								"begin_time": getISODateTimeString(this.begin_time),
								"end_time": getISODateTimeString(this.end_time),
								"bbox": this.bboxsel[0] +","+ this.bboxsel[1] +","+ this.bboxsel[2] +","+ this.bboxsel[3],
								"style": style,
								"dim_range": (range[0]+","+range[1]),
								"logarithmic": logarithmic
							}))

							.done(function( data ) {
								Papa.parse(data, {
									header: true,
									dynamicTyping: true,
									//name: name,
									complete: function(results) {
										that.createPrimitives(results, name)
									}
								});
							});



                		}
                	}, this);

                	

	            }else{
	            	_.each(_.keys(this.FL_collection), function(key){
	            		this.map.scene.primitives.remove(this.FL_collection[key]);
                		delete this.FL_collection[key];
	            	}, this);
	            }

				
			},

			onFieldlinesChanged: function(){
				this.checkFieldLines();
			},


			createPrimitives: function(results, name){

				var parseddata = {};
				this.FL_collection[name] = new Cesium.PrimitiveCollection();

				_.each(results.data, function(row){
					if(parseddata.hasOwnProperty(row.id)){
						parseddata[row.id].colors.push(Cesium.Color.fromBytes(row.color_r, row.color_g, row.color_b, 255));
						parseddata[row.id].positions.push(new Cesium.Cartesian3(row.pos_x, row.pos_y, row.pos_z));
					}else{
						parseddata[row.id] = {
							colors:[Cesium.Color.fromBytes(row.color_r, row.color_g, row.color_b, 255)],
							positions:[new Cesium.Cartesian3(row.pos_x, row.pos_y, row.pos_z)]
						};
					}
				});

        		_.each(_.keys(parseddata), function(key){

					this.FL_collection[name].add(new Cesium.Primitive({
					    geometryInstances : new Cesium.GeometryInstance({
					        geometry : new Cesium.PolylineGeometry({
					            positions : parseddata[key].positions,
					            width : 2.0,
					            vertexFormat : Cesium.PolylineColorAppearance.VERTEX_FORMAT,
					            colors : parseddata[key].colors,
					            colorsPerVertex : true
					        })
					    }),
					    appearance : new Cesium.PolylineColorAppearance()
					}));

				}, this);

        		this.map.scene.primitives.add(this.FL_collection[name]);
				
			},

			onHighlightPoint: function(coords){

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

			    //var billboards = this.map.scene.primitives.add(new Cesium.BillboardCollection());
			    this.billboards.add({
			        imageId : 'custom canvas point',
			        image : canvas,
			        position : Cesium.Cartesian3.fromDegrees(coords[1], coords[0], parseInt(coords[2]-6384100)),
			        radius: coords[2],
			        //color : Cesium.Color.RED,
			        scale : 1
			    });
			    
			},

			onRemoveHighlights: function(){
				this.billboards.removeAll();
			},

			/*onSelectionChanged: function(coords) {
	            // FIXXME: The MapvView triggers the 'selection:changed' with the payload of 'null'
	            // when the selection items in the toolbar are clicked. This event triggers this method
	            // here in the VGV. So if the openlayers_geometry parameter is 'null' we skip the execution of this
	            // method.
				if (coords) {
					console.dir(coords);
				}
			},*/


			/*onLayerOutlinesChanged: function(layer, outlines){
				globals.products.each(function(product) {

					if(product.get("name")==layer){

						if(product.get("views")[0].protocol == "CZML"){
							this.checkLayerFeatures(product, product.get("visible"));
	                	}
				    }
                    
	            }, this);
			},*/

	        _convertCoordsFromOpenLayers: function(openlayer_geometry, altitude) {
	            var verts = openlayer_geometry.getVertices();

	            var coordinates = [];
	            for (var idx = 0; idx < verts.length - 1; ++idx) {
	                var p = {
	                    x: verts[idx].x,
	                    y: verts[idx].y,
	                    z: altitude // not mandatory, can be undefined
	                };

	                coordinates.push(p);
	            }
	            var p = {
	                x: verts[idx].x,
	                y: verts[idx].y,
	                z: altitude // not mandatory, can be undefined
	            };

	            coordinates.push(p);

	            return coordinates;
	        },

	        _convertCoordsFromCesium: function(prim, altitude) {

	            var coordinates = [];

	            coordinates.push({
	            	x: Cesium.Math.toDegrees(prim.west),
	            	y: Cesium.Math.toDegrees(prim.south),
	            	z: altitude
	            });
	            coordinates.push({
	            	x: Cesium.Math.toDegrees(prim.west),
	            	y: Cesium.Math.toDegrees(prim.north),
	            	z: altitude
	            });
	            coordinates.push({
	            	x: Cesium.Math.toDegrees(prim.east),
	            	y: Cesium.Math.toDegrees(prim.north),
	            	z: altitude
	            });
	            coordinates.push({
	            	x: Cesium.Math.toDegrees(prim.east),
	            	y: Cesium.Math.toDegrees(prim.south),
	            	z: altitude
	            });
	            
	            return coordinates;
	        },

	        _convertCoordsToOpenLayers: function(coords){
	        	var points = [];
                for (var idx = 0; idx < coords.length; idx++) {
                    points.push(new OpenLayers.Geometry.Point(coords[idx].x, coords[idx].y));
                };

                var ring = new OpenLayers.Geometry.LinearRing(points);
                var polygon = new OpenLayers.Geometry.Polygon([ring]);
                var feature = new OpenLayers.Feature.Vector(polygon);

                return feature;
	        },

			onTimeChange: function (time) {

				var string = getISODateTimeString(time.start) + "/"+ getISODateTimeString(time.end);

				this.begin_time = time.start;
				this.end_time = time.end;
                                        
	            globals.products.each(function(product) {
                    if(product.get("timeSlider")){
                    	product.set("time",string);
                    	var ces_layer = product.get("ces_layer");

                    	if(ces_layer){
	                    	ces_layer.imageryProvider.updateProperties("time", string);
	                    	if (ces_layer.show){
	                    		var index = this.map.scene.imageryLayers.indexOf(ces_layer);
	                    		this.map.scene.imageryLayers.remove(ces_layer, false);
	                    		this.map.scene.imageryLayers.add(ces_layer, index);
	                    	}
	                    }

	                    if(product.get("views")[0].protocol == "CZML"){
	                    	this.checkLayerFeatures(product, product.get("visible"));
                			
		        		}else if (product.get("views")[0].protocol == "WPS"){

                			if(product.get("visible")){

                				if(product.get('shc') != null){

                					var parameters = product.get("parameters");
		                			var band;
		                			var keys = _.keys(parameters);
									_.each(keys, function(key){
										if(parameters[key].selected)
											band = key;
									});
		                			var style = parameters[band].colorscale;
		                			var range = parameters[band].range;


                					var imageURI;
									var that = this;
									var imagelayer;
									//product.set("visible", true);

									var ces_layer = product.get("ces_layer");
									var index = this.map.scene.imageryLayers.indexOf(ces_layer);
									
									var url = product.get("views")[0].urls[0];

									$.post( url, Tmpl_load_shc({
										"shc": product.get('shc'),
										"begin_time": getISODateTimeString(this.begin_time),
										"end_time": getISODateTimeString(this.end_time),
										"band": band,
										"style": style,
										"range_min": range[0],
										"range_max": range[1],
										"height": product.get("height")
									}))

										.done(function( data ) {	
											that.map.scene.imageryLayers.remove(ces_layer);									
										    imageURI = "data:image/gif;base64,"+data;
										    var imagelayer = new Cesium.SingleTileImageryProvider({url: imageURI});
											ces_layer = that.map.scene.imageryLayers.addImageryProvider(imagelayer, index);
											product.set("ces_layer", ces_layer);
										});
                				}
							}
						}
                    }
	            }, this);

				// Compare models if two are selected
				if (this.activeModels.length == 2){

					var that = this;

					var model1 = _.find(globals.products.models, function(p){return p.get("name") == that.activeModels[0];});
					var model2 = _.find(globals.products.models, function(p){return p.get("name") == that.activeModels[1];});

					var product = model2;

					var models = [model1.get("views")[0].id, model2.get("views")[0].id];
					var shc = null;

					// Remove custom model with id shc if selected
					if (models.indexOf("shc")!=-1){
						shc = _.find(globals.products.models, function(p){return p.get("shc") != null;}).get("shc");
    					models.splice(models.indexOf("shc"), 1);
    				}

					models = models.join(",");

					var parameters = product.get("parameters");
        			var band;
        			var keys = _.keys(parameters);
					_.each(keys, function(key){
						if(parameters[key].selected)
							band = key;
					});
        			var style = parameters[band].colorscale;
        			var height = product.get("height");
        			var uom = parameters[band].uom;

					var imageURI;
					var url = model2.get("views")[0].urls[0];

					$.post( url, Tmpl_calc_diff({
						"model_ids": models,
						"shc": shc,
						"begin_time": getISODateTimeString(this.begin_time),
						"end_time": getISODateTimeString(this.end_time),
						//"band": band,
						"style": style,
						"height": height
					}), "xml")

						.done(function( data ) {

							if(that.difference_image)	
								that.map.scene.imageryLayers.remove(that.difference_image);

							var img64 = $(data.getElementsByTagName("ComplexData")).text();
						    imageURI = "data:image/gif;base64,"+img64;
						    var prov = new Cesium.SingleTileImageryProvider({url: imageURI});
							that.difference_image = that.map.scene.imageryLayers.addImageryProvider(prov);
							that.map.scene.imageryLayers.lower(that.difference_image);

							var style = $(data.getElementsByTagName("LiteralData")).text().split(",");


							
							var margin = 20;
							var width = $("#colorlegend").width();
							var scalewidth =  width - margin *2;


							$("#colorlegend").append(
								'<div class="'+style[0]+'" style="width:'+scalewidth+'px; height:20px; margin-left:'+margin+'px"></div>'
							);

							var svgContainer = d3.select("#colorlegend").append("svg")
								.attr("width", width)
								.attr("height", 60);


							var axisScale = d3.scale.linear();

							axisScale.domain([parseFloat(style[1]), parseFloat(style[2])]);
							axisScale.range([0, scalewidth]);

							var xAxis = d3.svg.axis()
								.scale(axisScale);


							xAxis.tickValues( axisScale.ticks( 5 ).concat( axisScale.domain() ) );
							xAxis.tickFormat(d3.format('.02f'));


						    svgContainer.append("g")
						        .attr("class", "x axis")
						        .attr("transform", "translate(" + [margin, 3]+")")
						        .call(xAxis)
						        .append("text")
									.style("text-anchor", "middle")
									.style("font-size", "1.1em")
									.attr("transform", "translate(" + [scalewidth/2, 40]+")")
									.text(uom);

							$("#colorlegend").show();

						});
				}

				this.checkFieldLines();
            },

            onSetExtent: function(bbox) {
            	//this.map.zoomToExtent(bbox);
            	this.map.scene.camera.flyToRectangle({
            		destination: Cesium.Rectangle.fromDegrees(bbox[0], bbox[1], bbox[2], bbox[3])
            	});

            },

            getURL: function(url, id, begin_time, end_time, band, range, style, color, outlines){

        		if(!outlines && band != "B_NEC"){
        			return url + "?service=WPS&version=1.0.0&request=Execute&" +
							  "identifier=retrieve_czml&" +
							  "DataInputs="+
							  "collection_ids="+ id +"%3B"+
							  "begin_time="+ begin_time +"%3B"+
							  "end_time="+ end_time +"%3B"+
							  "band="+ band +"%3B"+
							  "dim_range="+ range[0] +","+ range[1] +"%3B"+
							  "style="+ style +"&"+
							  "rawdataoutput=output";
        		}
        		return url + "?service=WPS&version=1.0.0&request=Execute&" +
							  "identifier=retrieve_czml&" +
							  "DataInputs="+
							  "collection_ids="+ id +"%3B"+
							  "begin_time="+ begin_time +"%3B"+
							  "end_time="+ end_time +"%3B"+
							  "band="+ band +"%3B"+
							  "dim_range="+ range[0] +","+ range[1] +"%3B"+
							  "style="+ style +"%3B"+
							  "colors="+ color +"&"+
							  "rawdataoutput=output";
            },

			onClose: function(){
				this.stopListening();
				this.remove();
				this.unbind();
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

				proj4326 = new OpenLayers.Projection("EPSG:4326");
				bounds = selection_bounds;

				bounds.transform(proj4326, this.map.getProjectionObject());
				this.diff_overlay = new OpenLayers.Layer.Image('diff_overlay', url, bounds, new OpenLayers.Size(3400, 1600), {
				 'isBaseLayer': false,
				 'alwaysInRange': true
				});
				this.map.addLayer(this.diff_overlay);
				this.diffimage_index = this.map.getLayerIndex(this.diff_overlay);
				console.log("image "+this.diffimage_index);

				var minzindex = 9999;

				_.each(this.overlay_layers, function(layer){
					 var zindex = layer.getZIndex();
					 if (zindex < minzindex)
					 	minzindex = zindex;
				}.bind(this));

				this.diff_overlay.setZIndex(minzindex-1);
	
			},

			onSaveImage: function(){
				var dataUrl = this.map.canvas.toDataURL("image/jpeg");
				var a = document.createElement("a");
				a.download = "VirES_virtual_globe.jpeg";
				a.href = dataUrl;
				$('#pngdataurl').append(a);
				a.click();
				$('#pngdataurl').empty();
			},

			onClearImage: function(){
				if(this.diff_overlay){
					this.map.removeLayer(this.diff_overlay);
					this.diff_overlay = null;
				}
			},

			handleTick: function(clock) {
				// TODO: Cesium does not provide a method to know when the camera has stopped, 
				//       this approach is not ideal, when the movement mantains inertia difference 
				//       values are very low and there are comparison errors.
			    var camera = this.map.scene.camera;

			    if (!this.camera_is_moving){
			    	if (Math.abs(this.camera_last_position.x - camera.position.x) > 10000 &&
			    		Math.abs(this.camera_last_position.y - camera.position.y) > 10000 &&
			    		Math.abs(this.camera_last_position.z - camera.position.z) > 10000 ){

			    		this.camera_is_moving = true;
			    	}
			    }else{
			    	if (Math.abs(this.camera_last_position.x - camera.position.x) < 10000 &&
			    		Math.abs(this.camera_last_position.y - camera.position.y) < 10000 &&
			    		Math.abs(this.camera_last_position.z - camera.position.z) < 10000 ){

			    		this.camera_is_moving = false;
			    		Communicator.mediator.trigger("map:position:change", this.getMapExtent() );
			    	}else{
			    		this.camera_last_position.x = camera.position.x;
			    		this.camera_last_position.y = camera.position.y;
			    		this.camera_last_position.z = camera.position.z;
			    	}
			    }
			},

			toggleDebug: function(){
				this.map.scene.debugShowFramesPerSecond = !this.map.scene.debugShowFramesPerSecond;
			}

		});

		return CesiumView;
	});