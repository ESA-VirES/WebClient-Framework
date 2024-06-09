define([
  'virtualglobeviewer/GlobWeb',
  'virtualglobeviewer/RenderContext',
  'virtualglobeviewer/SceneGraph/SceneGraph',
  'virtualglobeviewer/SceneGraph/Renderer',
  'virtualglobeviewer/W3DSLayer',
  'virtualglobeviewer/TileWireframeLayer',
  'virtualglobeviewer/Loader/glTF/glTFLoader',
  'virtualglobeviewer/CoordinateSystem',
  './AOIRenderer',
  'app', // FIXXME: should not be here, this is the wrong layer (really wrong...)!
  'openlayers' // FIXXME: replace OpenLayers with generic format!
], function (GlobWeb, GlobWebRenderContext, SceneGraph, SceneGraphRenderer, W3DSLayer, TileWireframeLayer, GlobWebGLTFLoader, CoordinateSystem, AOIRenderer, App, OpenLayers) {

  'use strict';

  var VGV = function (options) {
    this.canvas = $(options.canvas);

    if (!this.canvas) {
      alert('[VGV::constructor] Please define a canvas element!. Aborting VGV construction...');
      return;
    }

    // Set the near plane before instantiating the globe:
    GlobWebRenderContext.minNear = 0.0001;

    this.globe = new GlobWeb.Globe({
      canvas: options.canvas,
      lighting: false,
      tileErrorTreshold: 3,
      continuousRendering: false,
      backgroundColor: [0.2, 0.2, 0.2, 1],
      shadersPath: "/virtualglobeviewer/shaders/"
    });

    this.aoiLayer = new GlobWeb.VectorLayer({
      opacity: 1
    });
    this.globe.addLayer(this.aoiLayer);

    this.layerCache = {};
    this.overlayLayers = [];
    this.onPanEventCallback = null;
    this.onZoomEventCallback = null;

    this.navigation = new GlobWeb.Navigation(this.globe, {
      inertia: false
    });
    var pan = this.navigation.pan.bind(this.navigation);
    this.navigation.pan = function (dx, dy) {
      // If the MapView is currently panning do not allow the VGV to do a pan. This would result in an infinite loop.
      if (App.isMapPanning) {
        console.log('prevent panning...');
        return;
      }

      if (this.onPanEventCallback) {
        this.onPanEventCallback(this.navigation, dx, dy);
      }

      pan(dx, dy);
    }.bind(this);

    var zoom = this.navigation.zoom.bind(this.navigation);
    this.navigation.zoom = function (delta, scale) {
      // If the MapView is currently panning do not allow the VGV to do a pan. This would result in an infinite loop.
      if (App.isMapZooming) {
        console.log('prevent panning...');
        return;
      }

      if (this.onZoomEventCallback) {
        this.onZoomEventCallback(this.navigation, delta, scale);
      }

      zoom(delta, scale);
    }.bind(this);


    this.w3dsBaseUrl = options.w3dsBaseUrl;

    this.aoiRenderer = new AOIRenderer(this.globe, this.navigation, this.aoiLayer);
    this.aoiRenderer.setOnSelectionEndCallback(function (selection) {
      this.onNewAOICallback(selection);
    }.bind(this));

    // // glTF loader test:
    // var sgRenderer;
    // var renderContext = this.globe.renderContext;

    // var loader = Object.create(GlobWebGLTFLoader);
    // loader.initWithPath("/data/vcurtains/vrvis-demo/vrvis-demo.json");

    // var onLoadedCallback = function(success, rootObj) {
    //     sgRenderer = new SceneGraphRenderer(renderContext, rootObj, {
    //         minNear: GlobWebRenderContext.minNear,
    //         far: 6,
    //         fov: 45,
    //         enableAlphaBlending: true
    //     });
    //     renderContext.addRenderer(sgRenderer);
    // };

    // loader.load({
    //     rootObj: new SceneGraph.Node()
    // }, onLoadedCallback);
  };

  var convertFromOpenLayers = function (ol_geometry, altitude) {
    var verts = ol_geometry.geometry.getVertices();

    var coordinates = [];
    for (var idx = 0; idx < verts.length; ++idx) {
      var p = [];

      p.push(verts[idx].x);
      p.push(verts[idx].y);
      p.push(altitude);

      coordinates.push(p);
    }
    var p = [];

    p.push(verts[0].x);
    p.push(verts[0].y);
    p.push(altitude);
    coordinates.push(p);

    return coordinates;
  };

  VGV.prototype.setOnPanEventCallback = function (cb) {
    this.onPanEventCallback = cb;
  };

  VGV.prototype.setOnZoomEventCallback = function (cb) {
    this.onZoomEventCallback = cb;
  };

  VGV.prototype.enableAOISelection = function (type, selectionType) {
    // console.log('[VGV::enableAOISelection] type: ' + type);
    this.aoiRenderer.enableSelection(type, selectionType);
  };

  VGV.prototype.disableAOISelection = function () {
    // console.log('[VGV::disableAOISelection] disabled');
    this.aoiRenderer.disableSelection();
  };

  VGV.prototype.removeFeatures = function () {
    this.aoiRenderer.removeFeatures();
  };

  VGV.prototype.addAreaOfInterest = function (coords, color) {
    this.aoiRenderer.addAOI(coords, color);
  };

  VGV.prototype.setOnNewAOICallback = function (cb) {
    this.aoiRenderer.setOnSelectionEndCallback(cb);
  };

  VGV.prototype.createCommonLayerOptionsFromView = function (view) {
    var opts = {};

    opts.baseUrl = view.urls[0];

    opts.style = ''; // MapProxy needs a style argument, even if its empty
    if (view.style) {
      opts.style = view.style;
    }

    if (view.protocol === 'WMS') {
      opts.layers = view.id;
    } else {
      opts.layer = view.id;
    }

    opts.format = view.format || 'image/jpeg';

    if (opts.format === 'image/png') {
      opts.transparent = true;
    }

    return opts;
  };

  VGV.prototype.setColorRamp = function (config) {
    this.colorRamp = config;

    var sgRenderer = this.globe.sceneGraphOverlayRenderer;
    if (sgRenderer) {
      sgRenderer.setColorRamp(config);
    }

    this.requestFrame();
  };

  VGV.prototype.getSupportedViews = function (model) {
    var supported_views = [];

    var views = model.get('views');
    var wmtsIsAvailable = false;

    if (typeof(views) == 'undefined') {
      views = [];
      views.push(model.get('view'));
    }

    var w3ds = _.find(views, function (view) {
      return view.protocol === 'W3DS' && view.type === 'vertical_curtain';
    });

    var wmts = _.find(views, function (view) {
      if (view.protocol === "WMTS") {
        wmtsIsAvailable = true; // A WMTS layer is prefered compared to a WMS layer
        return true;
      }

      return false;
    });

    if (!wmtsIsAvailable) {
      var wms = _.find(views, function (view) {
        return view.protocol === "WMS";
      });

      if (wms) {
        supported_views.push(wms);
      }
    }

    var dem = _.find(views, function (view) {
      return view.protocol === "DEM";
    });

    var wireframe = _.find(views, function (view) {
      return view.protocol === "WIREFRAME";
    });

    if (w3ds) {
      supported_views.push(w3ds);
    }

    if (wmts) {
      supported_views.push(wmts);
    }

    if (dem) {
      supported_views.push(dem);
    }

    if (wireframe) {
      supported_views.push(wireframe);
    }

    return supported_views;
  };

  VGV.prototype.addLayer = function (model, isBaseLayer) {
    var layer = undefined;
    var isElevationLayer = false;

    var views = this.getSupportedViews(model);

    _.each(views, function (view) {
      var cacheId = model.get('name') + '-' + view.protocol;
      var opts = this.createCommonLayerOptionsFromView(view);
      opts.time = this.currentToI;

      // NOTE: Within the layerCache the key is a concatenated string with 'name-protocol' structure.
      var layerDesc = this.layerCache[cacheId];

      if (typeof layerDesc === 'undefined') {

        if (view.protocol === 'WMTS') {
          var layer_opts = _.extend(opts, {
            matrixSet: view.matrixSet,
          });

          layer = new GlobWeb.WMTSLayer(layer_opts);
        } else if (view.protocol === 'WMS') {
          layer = new GlobWeb.WMSLayer(opts);
        } else if (view.protocol === 'W3DS') {
          // FIXXME: think on where to set the color ramp! This place
          // might not be the best one...
          var o = _.extend(opts, {
            renderOptions: {
              colorRamp: this.colorRamp,
              w3dsBaseUrl: this.w3dsBaseUrl
            }
          });

          layer = new W3DSLayer(o);
          // console.log('[VGV::addLayer] added W3DS layer. ', layer);
        } else if (view.protocol === 'WIREFRAME') {
          layer = new TileWireframeLayer({
            outline: true
          });
        } else if (view.protocol === 'DEM') {
          layer = new GlobWeb.WCSElevationLayer({
            baseUrl: "http://data.eox.at/elevation?",
            coverage: "ACE2",
            version: "2.0.0"
          });
          this.globe.setBaseElevation(layer);
        } else {
          console.log('[VGV::addLayer] protocol "' + view.protocol + '" is not supported');
        }
      } else {
        layer = layerDesc.layer;
        // console.log('[VGV.addLayer] retrieved layer "' + model.get('name') + '" from the cache.');
      }

      if (isBaseLayer) {
        this.globe.setBaseImagery(layer);
      } else if (isElevationLayer) {
        this.globe.setBaseElevation(layer);
      } else {
        // FIXXME: when adding a layer the 'ordinal' has to be considered!
        // Unfortunately GlobWeb does not seem to have a layer ordering mechanism,
        // therefore we have to remove all layers and readd the in the correct order.
        // This results in flickering when adding a layer and should be fixed within GlobWeb.
        this.globe.addLayer(layer);
        layer.opacity(model.get('opacity'));

        layerDesc = {
          model: model,
          layer: layer,
          isBaseLayer: isBaseLayer
        };

        this.layerCache[cacheId] = layerDesc;
        this.overlayLayers.push(layerDesc);
      }
    }.bind(this));
  };

  VGV.prototype.removeLayer = function (model, isBaseLayer) {
    console.log('removeLayer: ' + model.get('name') + " (baseLayer: " + isBaseLayer + ")");

    var layer = undefined,
      isElevationLayer = false,
      views = this.getSupportedViews(model);

    _.each(views, function (view) {
      isElevationLayer = (view.protocol === 'DEM');

      if (isBaseLayer) {
        this.globe.setBaseImagery(null);
      } else if (isElevationLayer) {
        this.globe.setBaseElevation(null);
      } else {
        var cacheId = model.get('name') + '-' + view.protocol;
        var layerDesc = this.layerCache[cacheId];
        if (typeof layerDesc !== 'undefined') {
          this.globe.removeLayer(layerDesc.layer);
          var idx = _.indexOf(this.overlayLayers, layerDesc);
          this.overlayLayers.splice(idx, 1);
        }
      }
    }.bind(this));
  };

  VGV.prototype.sortOverlayLayers = function () {
    // Copy the current overlay layers into an array, sorted by the ordinal parameter:
    var sortedOverlayLayers = _.sortBy(this.overlayLayers, function (desc) {
      return desc.model.get('ordinal');
    });

    // Remove the current overlay layers (setting this.overlayLayers.length = 0):
    this.removeAllOverlays();

    _.each(sortedOverlayLayers.reverse(), function (desc) {
      console.log('sort: adding layer with ordinal: ' + desc.model.get('ordinal'));
      this.addLayer(desc.model, desc.isBaseLayer);
    }.bind(this));
  };

  VGV.prototype.removeAllOverlays = function () {
    _.each(this.overlayLayers, function (desc, idx) {
      this.globe.removeLayer(desc.layer);
    }.bind(this));

    this.overlayLayers.length = 0;
  };

  VGV.prototype.clearCache = function () {
    this.layerCache = {};
  };

  // FIXXME: Implement GlobWeb::BaseLayer::setTime() for that to work
  // VGV.prototype.setTimeSpanOnLayers = function(newTimeSpan) {
  //     var updated_layer_descs = [];

  //     _.each(this.layerCache, function(layerDesc, name) {
  //         if (layerDesc.timeSupport) {
  //             var isotimespan = getISODateTimeString(newTimeSpan.start) + '/' + getISODateTimeString(newTimeSpan.end);
  //             layerDesc.layer.setTime(isotimespan);
  //             updated_layer_descs.push(layerDesc);
  //             //console.log('[VGV.setTimeSpanOnLayers] setting new timespan on "' + layerDesc.productName + '": ' + isotimespan);
  //         }
  //     });

  //     _.each(updated_layer_descs, function(desc, idx) {
  //         if (desc.isBaseLayer) {
  //             this.globe.setBaseImagery(desc.layer);
  //         } else {
  //             // FIXXME: is there an update() functionality somewhere?
  //             this.globe.removeLayer(desc.layer);
  //             this.globe.addLayer(desc.layer);
  //         }
  //     }.bind(this));
  // };

  VGV.prototype.updateViewport = function () {
    // FIXXME: the height/width has to be set explicitly after setting the
    // the new css class. Why?
    this.globe.renderContext.canvas.width = this.canvas.width();
    this.globe.renderContext.canvas.height = this.canvas.height();

    // Adjust the globe's aspect ration and redraw:
    this.globe.renderContext.updateViewDependentProperties();
    this.globe.refresh();
  };

  // var pos = {
  //     center: [74, 15],
  //     distance: 10000000,
  //     duration: 1000,
  //     tilt: 45
  // };
  VGV.prototype.zoomTo = function (pos) {
    if (!pos.tilt) {
      var cur_pos = this.navigation.save();
      this.navigation.zoomTo(pos.center, pos.distance, pos.duration, cur_pos.tilt);
    } else {
      this.navigation.zoomTo(pos.center, pos.distance, pos.duration, pos.tilt);
    }
  };

  VGV.prototype.setTilt = function (value, duration) {
    // FIXXME: wunderschoen...
    var pos = this.navigation.save(),
      distance = pos.distance * CoordinateSystem.realEarthRadius;

    this.navigation.zoomTo(pos.geoCenter, distance, duration || 1, value);
  };

  VGV.prototype.setToI = function (time) {
    this.currentToI = time;

    _.each(this.overlayLayers, function (desc) {
      if (desc.layer.setTime) {
        desc.layer.setTime(time);
        this.globe.removeLayer(desc.layer);
        this.globe.addLayer(desc.layer);
      }
    }.bind(this));
  };

  VGV.prototype.onOpacityChange = function (layer_name, opacity) {
    // FIXXME: refactor layerCache into an object with a .get('layername') method!
    var layerDesc = this.layerCache[layer_name + '-WMS'] || this.layerCache[layer_name + '-WMTS'];
    if (typeof layerDesc !== 'undefined') {
      layerDesc.layer.opacity(opacity);
    }
    this.requestFrame();
  };

  VGV.prototype.dumpLayerConfig = function () {
    _.each(this.overlayLayers, function (desc) {
      console.log('-------------------------------------------------');
      console.log('Layer: ' + desc.model.get('name'));
      console.log('   ordinal: ' + desc.model.get('ordinal'));
      console.log('   opacity: ' + desc.layer.opacity());
    }.bind(this));
  };

  VGV.prototype.requestFrame = function () {
    this.globe.renderContext.requestFrame();
  };

  return VGV;
});



// var elevationLayer = new GlobWeb.WCSElevationLayer({
//  baseUrl: "http://demonstrator.telespazio.com/wcspub",
//  coverage: "GTOPO",
//  version: "1.0.0"
// });
// globe.setBaseElevation(elevationLayer);


// var test_aoi = new TestAreaOfInterestRenderer(globe);
// test_aoi.run();

// TODO: refactor Tests to a more appropriate location!
//var test_selectiontool = new TestSelectionTool(App, globe, navigation);
//test_selectiontool.run();

// var atmosphere = new GlobWeb.AtmosphereLayer({
//  visible: true,
//  exposure: 1.4
// });
// globe.addLayer(atmosphere);

//globe.addLayer(new GlobWeb.EquatorialGridLayer({}));
//globe.addLayer(new GlobWeb.TileWireframeLayer());

// Add some vector layer
// $.ajax({
//  url: "europe.json",
//  success: function(data) {
//      var vectorLayer = new GlobWeb.VectorLayer();
//      vectorLayer.addFeatureCollection(data);
//      globe.addLayer(vectorLayer);
//      console.log("added vectorlayer");
//  },
//  error: function() {
//      console.log("error");
//  }
// });

// var effectLayer = new GlobWeb.EffectLayer();
// globe.addLayer(effectLayer);

// var effect_desc = {};
// effect_desc.id = "overlay_triangle";

// var vertexShader = "\
//  attribute vec3 vertex;\n\
//  attribute vec4 color;\n\
//  varying vec4 vColor;\n\
//           uniform mat4 viewProjectionMatrix;\n\
//           void main(void) {\n\
//               gl_Position = viewProjectionMatrix * vec4(vertex, 1.0);\n\
//               /*gl_Position = vec4(vertex, 1.0);*/\n\
//      vColor = color;\n\
//           }\n\
//           ";

// var fragmentShader = "\
//           precision mediump float;\n\
//           varying vec4 vColor;\n\
//           void main(void) {\n\
//               gl_FragColor = vColor;\n\
//           }\n\
//           ";

// effect_desc.program = new GlobWeb.Program(globe.renderContext);
// effect_desc.program.createFromSource(vertexShader, fragmentShader);

// effect_desc.mesh = new Mesh(globe.renderContext);

// // var vertices = [0.0, 0.5, 0.0, -0.5, -0.5, 0.0,
// // 0.5, -0.5, 0.0, 0.5, 0.5, 0.0];
// var vertices = [-1.5, -1.5, 0.0,
// 1.5, -1.5, 0.0, 0.0, 1.5, 0.0];
// var indices = [0, 1, 2];
// var colors = [0.0, 1.0, 1.0, 1.0, 0.0, 1.0, 0.0, 1.0, 1.0, 1.0, 1.0, 0.0];
// effect_desc.mesh.setVertices(vertices);
// effect_desc.mesh.setIndices(indices);
// effect_desc.mesh.setColors(colors);

// effectLayer.addEffect(effect_desc);

// var geo = [47.070761, 15.439498, 100],
//  dest = [];
// CoordinateSystem.fromGeoTo3D(geo, dest)
// console.log("Worldcoordinates:");
// console.dir(dest);



// var style = new GlobWeb.FeatureStyle({
//  iconUrl: null,
//  //icon: Text.generateImageData("Coucou!"),
//  pointMaxSize: 4000,
//  radius: 10,
//  renderer: "pulsar"
// });

// var layer = new GlobWeb.VectorLayer({
//  style: style
// });
// globe.addLayer(layer);

// // var geo = [47, 15, 600];
// // var dest = CoordinateSystem.fromGeoTo3D(geo);
// // console.log("test: ");
// // console.dir(dest);

// var geoJSON = {
//  "type": "Feature",
//  "geometry": {
//      "type": "Point",
//      "coordinates": [15.439498, 47.070761]
//  }
// }
// layer.addFeature(geoJSON);
// layer.animate(0, 4);

// var canvas = this.el;
// var poi;
// canvas.onclick = function(event) {
//  //if (poi) layer.removeFeature(poi);

//  var pos = globe.renderContext.getXYRelativeToCanvas(event);
//  var lonlat = globe.getLonLatFromPixel(pos[0], pos[1]);
//  poi = {
//      geometry: {
//          type: "Point",
//          coordinates: lonlat
//      }
//  };
//  layer.addFeature(poi);
// };
