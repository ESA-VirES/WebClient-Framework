(function() {
	'use strict';

	var root = this;

	root.define([
			'backbone',
			'globals',
			'regions/DialogRegion', 'regions/UIRegion',
			'layouts/LayerControlLayout',
			'layouts/ToolControlLayout',
			'layouts/OptionsLayout',
			'core/SplitView/WindowView',
			'communicator',
			'jquery', 'backbone.marionette',
			'controller/ContentController',
			'controller/DownloadController',
			'controller/SelectionManagerController',
			'controller/LoadingController',
			'controller/LayerController',
			'controller/SelectionController',
			'controller/DifferenceController',
			'vendor/colorlegend'
		],

		function(Backbone, globals, DialogRegion,
			UIRegion, LayerControlLayout, ToolControlLayout, OptionsLayout, WindowView, Communicator) {

		var Application = Backbone.Marionette.Application.extend({
			initialize: function(options) {
			},

			configure: function(config) {


				// Load jquery ui tooltip tool

				/*$(document).ready(function() {
				    $("body").tooltip({ 
				    	selector: '[data-toggle=tooltip]',
				    	position: { my: "left+5 center", at: "right center" },
						hide: { effect: false, duration: 0 },
						show:{ effect: false, delay: 700}
				    });

				});*/

				$("body").tooltip({ 
			    	selector: '[data-toggle=tooltip]',
			    	position: { my: "left+5 center", at: "right center" },
					hide: { effect: false, duration: 0 },
					show:{ effect: false, delay: 700}
			    });


				var v = {}; //views
				var m = {};	//models
				var t = {};	//templates

				// Application regions are loaded and added to the Marionette Application
				_.each(config.regions, function(region) {
					var obj = {};
					obj[region.name] = "#" + region.name;
					this.addRegions(obj);
					console.log("Added region " + obj[region.name]);
				}, this);

				//Load all configured views
				_.each(config.views, function(viewDef) {
					var View = require(viewDef);
					$.extend(v, View);
				}, this);

				//Load all configured models
				_.each(config.models, function(modelDef) {
					var Model = require(modelDef);
					$.extend(m, Model);
				}, this);

				//Load all configured templates
				_.each(config.templates, function(tmplDef) {
					var Tmpl = require(tmplDef.template);
					t[tmplDef.id] = Tmpl;
				}, this);

				this.templates = t;
				this.views = v;


				//Map attributes are loaded and added to the global map model
				globals.objects.add('mapmodel', new m.MapModel({
						visualizationLibs : config.mapConfig.visualizationLibs,
						center: config.mapConfig.center,
						zoom: config.mapConfig.zoom,
						sun: _.has(config.mapConfig, 'showSun') ? config.mapConfig.showSun: true,
						moon: _.has(config.mapConfig, 'showMoon') ? config.mapConfig.showMoon: true,
						skyBox: _.has(config.mapConfig, 'showSkyBox') ? config.mapConfig.showSkyBox: true,
						skyAtmosphere: _.has(config.mapConfig, 'skyAtmosphere') ? config.mapConfig.skyAtmosphere: true,
						backgroundColor: _.has(config.mapConfig, 'backgroundColor') ? config.mapConfig.backgroundColor: "#000"
					})
				);


				//Base Layers are loaded and added to the global collection
				_.each(config.mapConfig.baseLayers, function(baselayer) {

					globals.baseLayers.add(
						new m.LayerModel({
							name: baselayer.name,
							visible: baselayer.visible,
							view: {
								id : baselayer.id,
								urls : baselayer.urls,
								protocol: baselayer.protocol,
								projection: baselayer.projection,
								attribution: baselayer.attribution,
								matrixSet: baselayer.matrixSet,
								style: baselayer.style,
								format: baselayer.format,
								resolutions: baselayer.resolutions,
								maxExtent: baselayer.maxExtent,
								gutter: baselayer.gutter,
								buffer: baselayer.buffer,
								units: baselayer.units,
								transitionEffect: baselayer.transitionEffect,
								isphericalMercator: baselayer.isphericalMercator,
								isBaseLayer: true,
								wrapDateLine: baselayer.wrapDateLine,
								zoomOffset: baselayer.zoomOffset,
									//time: baselayer.time // Is set in TimeSliderView on time change.
							},
							views: baselayer.views
						})
					);
					console.log("Added baselayer " + baselayer.id );
				}, this);
				
				var autoColor = {
		            colors : d3.scale.category10(),
		            index : 0,
		            getColor: function () { return this.colors(this.index++) }
		        }


				//Productsare loaded and added to the global collection
                var ordinal = 0;
                var domain = [];
                var range = [];

				_.each(config.mapConfig.products, function(product) {
					var p_color = product.color ? product.color : autoColor.getColor();
					globals.products.add(
						new m.LayerModel({
							name: product.name,
							visible: product.visible,
                            ordinal: ordinal,
							timeSlider: product.timeSlider,
							// Default to WMS if no protocol is defined
							timeSliderProtocol: (product.timeSliderProtocol) ? product.timeSliderProtocol : "WMS",
							color: p_color,
							//time: products.time, // Is set in TimeSliderView on time change.
							opacity: (product.opacity) ? product.opacity : 1,
							views: product.views,
							view: {isBaseLayer: false},
							download: {
								id: product.download.id,
								protocol: product.download.protocol,
								url: product.download.url
							},
							processes: product.processes,
							unit: product.unit,
							parameters: product.parameters,
							height: product.height,
							outlines: product.outlines,
							model: product.model,
							coefficients_range: product.coefficients_range,
							satellite: product.satellite
						})
					);

					if(product.processes){
						domain.push(product.processes[0].layer_id);
						range.push(p_color);
					}
					
					console.log("Added product " + product.name );
				}, this);

				var productcolors = d3.scale.ordinal().domain(domain).range(range);

				globals.objects.add('productcolors', productcolors);
	      	
				//Overlays are loaded and added to the global collection
				_.each(config.mapConfig.overlays, function(overlay) {

						globals.overlays.add(
							new m.LayerModel({
								name: overlay.name,
								visible: overlay.visible,
								ordinal: ordinal,
								view: {
									id: overlay.id,
									urls: overlay.urls,
									protocol: overlay.protocol,
									projection: overlay.projection,
									attribution: overlay.attribution,
									matrixSet: overlay.matrixSet,
									style: overlay.style,
									format: overlay.format,
									resolutions: overlay.resolutions,
									maxExtent: overlay.maxExtent,
									gutter: overlay.gutter,
									buffer: overlay.buffer,
									units: overlay.units,
									transitionEffect: overlay.transitionEffect,
									isphericalMercator: overlay.isphericalMercator,
									isBaseLayer: false,
									wrapDateLine: overlay.wrapDateLine,
									zoomOffset: overlay.zoomOffset,
									//time: overlay.time // Is set in TimeSliderView on time change.
								}
							})
						);
						console.log("Added overlay " + overlay.id);
					}, this);


				// If Navigation Bar is set in configuration go trhough the 
				// defined elements creating a item collection to rendered
				// by the marionette collection view
				if (config.navBarConfig) {

					var addNavBarItems = defaultFor(self.NAVBARITEMS, []);
					config.navBarConfig.items = config.navBarConfig.items.concat(addNavBarItems);
					var navBarItemCollection = new m.NavBarCollection;

					_.each(config.navBarConfig.items, function(list_item){
						navBarItemCollection.add(
							new m.NavBarItemModel(list_item)
						);
					}, this);

					this.topBar.show(new v.NavBarCollectionView(
						{template: t.NavBar({
							title: config.navBarConfig.title,
							url: config.navBarConfig.url}),
						className:"navbar navbar-inverse navbar-fixed-top not-selectable",
						itemView: v.NavBarItemView, tag: "div",
						collection: navBarItemCollection}));

				};

				// Added region to test combination of backbone
				// functionality combined with jQuery UI
				this.addRegions({dialogRegion: DialogRegion.extend({el: "#viewContent"})});
				this.DialogContentView = new v.ContentView({
					template: {type: 'handlebars', template: t.Info},
                    id: "about",
                    className: "modal fade",
                    attributes: {
                        role: "dialog",
                        tabindex: "-1",
                        "aria-labelledby": "about-title",
                        "aria-hidden": true,
                        "data-keyboard": true,
                        "data-backdrop": "static"
                    }
				});

				// Create the views - these are Marionette.CollectionViews that render ItemViews
                this.baseLayerView = new v.BaseLayerSelectionView({
                	collection:globals.baseLayers,
                	itemView: v.LayerItemView.extend({
                		template: {
                			type:'handlebars',
                			template: t.BulletLayer},
                		className: "radio"
                	})
                });

                this.productsView = new v.LayerSelectionView({
                	collection:globals.products,
                	itemView: v.LayerItemView.extend({
                		template: {
                			type:'handlebars',
                			template: t.CheckBoxLayer},
                		className: "sortable-layer"
                	}),
                	className: "sortable"
                });

                this.overlaysView = new v.BaseLayerSelectionView({
                	collection: globals.overlays,
                	itemView: v.LayerItemView.extend({
                		template: {
                			type: 'handlebars',
                			template: t.CheckBoxOverlayLayer},
                		className: "checkbox"
                	}),
                	className: "check"
                });



                // Create layout that will hold the child views
                this.layout = new LayerControlLayout();


                // Define collection of selection tools
                var selectionToolsCollection = new m.ToolCollection();
                _.each(config.selectionTools, function(selTool) {
					selectionToolsCollection.add(
							new m.ToolModel({
								id: selTool.id,
								description: selTool.description,
								icon:selTool.icon,
								enabled: true,
								active: false,
								type: "selection",
								selectionType: selTool.selectionType
							}));
				}, this);

                // Define collection of visualization tools
                var visualizationToolsCollection = new m.ToolCollection();
                _.each(config.visualizationTools, function(visTool) {
					visualizationToolsCollection.add(
							new m.ToolModel({
								id: visTool.id,
								eventToRaise: visTool.eventToRaise,
								description: visTool.description,
								disabledDescription: visTool.disabledDescription,
								icon:visTool.icon,
								enabled: visTool.enabled,
								active: visTool.active,
								type: "tool"
							}));
				}, this);

				// Define collection of visualization modes
                var visualizationModesCollection = new m.ToolCollection();
                _.each(config.visualizationModes, function(visMode) {
                    visualizationModesCollection.add(
                        new m.ToolModel({
                            id: visMode.id,
                            eventToRaise: visMode.eventToRaise,
                            description: visMode.description,
                            icon: visMode.icon,
                            enabled: visMode.enabled,
                            active: visMode.active,
                            type: "vis_mode"
                        }));
                }, this);	
                
                // Create Collection Views to hold set of views for selection tools
                this.visualizationToolsView = new v.ToolSelectionView({
                	collection:visualizationToolsCollection,
                	itemView: v.ToolItemView.extend({
                		template: {
                			type:'handlebars',
                			template: t.ToolIcon}
                	})
                });

                // Create Collection Views to hold set of views for visualization tools
                this.selectionToolsView = new v.ToolSelectionView({
                	collection:selectionToolsCollection,
                	itemView: v.ToolItemView.extend({
                		template: {
                			type:'handlebars',
                			template: t.ToolIcon}
                	})
                });


                // Create Collection Views to hold set of views for visualization modes
                this.visualizationModesView = new v.ToolSelectionView({
                    collection: visualizationModesCollection,
                    itemView: v.ToolItemView.extend({
                        template: {
                            type: 'handlebars',
                            template: t.ToolIcon
                        }
                    })
                });


                this.layerSettings = new v.LayerSettings();

                // Create layout to hold collection views
                this.toolLayout = new ToolControlLayout();
                this.optionsLayout = new OptionsLayout();

                

                // Instance timeslider view
                this.timeSliderView = new v.TimeSliderView(config.timeSlider);
                this.colorRampView = new v.ColorRampView(config.colorRamp);


			},

			// The GUI is setup after the application is started. Therefore all modules
			// are already registered and can be requested to populate the GUI.
			setupGui: function() {

				// Starts the SplitView module and registers it with the Communicator.
				this.module('SplitView').start();
				var splitview = this.module('SplitView').createController();
				this.main.show(splitview.getView());

				splitview.setSinglescreen();

				// Show Timsliderview after creating modules to
				// set the selected time correctly to the products
				this.bottomBar.show(this.timeSliderView);

				// Show storybanner
				/*if(this.storyBanner){
					this.storyView.show(this.storyBanner);
				}*/

			    // Add a trigger for ajax calls in order to display loading state
                // in mouse cursor to give feedback to the user the client is busy
                $(document).ajaxStart(function() {
                  	Communicator.mediator.trigger("progress:change", true);
                });

                $(document).ajaxStop(function() {
                  	Communicator.mediator.trigger("progress:change", false);
                });

                $(document).ajaxError(function( event, request, settings ) {
                	if(settings.suppressErrors) {
				        return;
				    }

                    $("#error-messages").append(
                              '<div class="alert alert-warning alert-danger">'+
                              '<button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button>'+
                              '<strong>Warning!</strong> Error response on HTTP ' + settings.type + ' to '+ settings.url.split("?")[0] +
                            '</div>'
                    );
                });

                // The tooltip is called twice at beginning and end, it seems to show the style of the
                // tooltips more consistently, there is some problem where sometimes no style is shown for tooltips
                $("body").tooltip({ 
			    	selector: '[data-toggle=tooltip]',
			    	position: { my: "left+5 center", at: "right center" },
					hide: { effect: false, duration: 0 },
					show:{ effect: false, delay: 700}
			    });

                // Remove loading screen when this point is reached in the script
                $('#loadscreen').remove();


                var data = [-10,0,1,3,5,7,8,10];
				var min = d3.min(data);
				var mean = d3.sum(data) / data.length;
				var max = d3.max(data);

				
				// linear scale, 2 colors
				/*var lScale = d3.scale.linear()
				.domain([-1, 0, max])
				.range(["rgb(255, 0, 0)", "rgb(255, 255, 255)", "rgb( 0, 0, 255)"]);
				colorlegend("#colorlegend", lScale, "linear", {title: "Difference of  to ", boxHeight: 15, boxWidth: 50, linearBoxes:9});*/


			}



		});

		return new Application();
	});
}).call( this );