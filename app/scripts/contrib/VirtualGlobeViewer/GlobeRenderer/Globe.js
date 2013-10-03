define([
	'virtualglobeviewer/GlobWeb',
], function(GlobWeb) {

	'use strict';

	function Globe(options) {
		this.canvas = $(options.canvas);

		if (!this.canvas) {
			alert('[Globe::constructor] Please define a canvas element!. Aborting Globe construction...')
			return;
		}

		this.globe = new GlobWeb.Globe({
			canvas: options.canvas,
			lighting: false,
			tileErrorTreshold: 3,
			continuousRendering: false,
			backgroundColor: [0, 0, 0, 0],
			// backgroundColor: [0.8, 0.8, 0.8, 1],
			shadersPath: "../bower_components/virtualglobeviewer/shaders/"
		});

		// Add mouse navigation
		var navigation = new GlobWeb.Navigation(this.globe, {
			inertia: true
		});

		// Add stats
		// var stats = new GlobWeb.Stats(globe, {
		// 	element: 'fps',
		// 	verbose: false
		// });

		// var osmLayer = new GlobWeb.OSMLayer({
		// 	baseUrl: "http://tile.openstreetmap.org"
		// });
		// globe.setBaseImagery(osmLayer);

		var blueMarbleLayer = new GlobWeb.WMSLayer({
			baseUrl: "http://demonstrator.telespazio.com/wmspub",
			layers: "BlueMarble",
			opacity: 0.1
		});
		this.globe.setBaseImagery(blueMarbleLayer);

		// var eoxLayer = new GlobWeb.WMTSLayer({
		// 	baseUrl: "http://c.maps.eox.at/tiles/wmts",
		// 	style: "default",
		// 	layer: "terrain_wgs84",
		// 	format: "image/png",
		// 	matrixSet: "WGS84"
		// });
		// eoxLayer.opacity(0.5);
		// this.globe.addLayer(eoxLayer);

		this.testAreaOfInterestRenderer(this.globe);
	};

	Globe.prototype.setViewport = function(width, height) {
		// FIXXME: the height/width has to be set explicitly after setting the
		// the new css class. Why?
		this.globe.renderContext.canvas.width = this.canvas.width();
		this.globe.renderContext.canvas.height = this.canvas.height();

		// Adjust the globe's aspect ration and redraw:
		this.globe.renderContext.updateViewDependentProperties();
		this.globe.refresh();
	},

	Globe.prototype.testAreaOfInterestRenderer = function(globe) {
		var style = new GlobWeb.FeatureStyle({
			fillColor: [0, 0, 255],
			outlineColor: [255, 255, 255],
			extrude: true,
			fill: true
			//renderer: "AreaOfInterest"
		});

		var aoi_layer = new GlobWeb.VectorLayer({
			style: style,
			opacity: 1
		});
		globe.addLayer(aoi_layer);

		var altitude = 30000;
		var selection0 = {
			"geometry": {
				"type": "Polygon",
				"coordinates": [
					[0.439498, 47.070761, altitude],
					[46.439498, 47.070761, altitude],
					[46.439498, 48.070761, altitude],
					[0.439498, 47.070761, altitude]
					// [15.439498, 48.070761, altitude],
					// [15.439498, 47.070761, altitude]
				]
			},
			"properties": {
				"style": style
			}
		};
		aoi_layer.addFeature(selection0);

		// setTimeout(function() {
		// 	aoi_layer.removeFeature(selection0);

		// 	var style = new GlobWeb.FeatureStyle({
		// 		fillColor: [255, 0, 255],
		// 		outlineColor: [255, 255, 255],
		// 		renderer: "AreaOfInterest"
		// 	});

		// 	var selection1 = {
		// 		"geometry": {
		// 			"type": "Polygon",
		// 			"coordinates": [
		// 				[15.439498, 47.070761, altitude],
		// 				[16.439498, 47.070761, altitude],
		// 				[16.439498, 48.070761, altitude],
		// 				[15.439498, 48.070761, altitude],
		// 				[15.439498, 47.070761, altitude]
		// 			]
		// 		},
		// 		"properties": {
		// 			"style": style
		// 		}
		// 	};
		// 	aoi_layer.addFeature(selection1);
		// }, 3000);

		console.log("[Test_AreaOfInterestRenderer::run] executed");
	};

	return Globe;
});



// var elevationLayer = new GlobWeb.WCSElevationLayer({
// 	baseUrl: "http://demonstrator.telespazio.com/wcspub",
// 	coverage: "GTOPO",
// 	version: "1.0.0"
// });
// globe.setBaseElevation(elevationLayer);


// var test_aoi = new TestAreaOfInterestRenderer(globe);
// test_aoi.run();

// TODO: refactor Tests to a more appropriate location!
//var test_selectiontool = new TestSelectionTool(App, globe, navigation);
//test_selectiontool.run();

// var atmosphere = new GlobWeb.AtmosphereLayer({
// 	visible: true,
// 	exposure: 1.4
// });
// globe.addLayer(atmosphere);

//globe.addLayer(new GlobWeb.EquatorialGridLayer({}));
//globe.addLayer(new GlobWeb.TileWireframeLayer());

// Add some vector layer
// $.ajax({
// 	url: "europe.json",
// 	success: function(data) {
// 		var vectorLayer = new GlobWeb.VectorLayer();
// 		vectorLayer.addFeatureCollection(data);
// 		globe.addLayer(vectorLayer);
// 		console.log("added vectorlayer");
// 	},
// 	error: function() {
// 		console.log("error");
// 	}
// });

// var effectLayer = new GlobWeb.EffectLayer();
// globe.addLayer(effectLayer);

// var effect_desc = {};
// effect_desc.id = "overlay_triangle";

// var vertexShader = "\
// 	attribute vec3 vertex;\n\
// 	attribute vec4 color;\n\
// 	varying vec4 vColor;\n\
//           uniform mat4 viewProjectionMatrix;\n\
//           void main(void) {\n\
//               gl_Position = viewProjectionMatrix * vec4(vertex, 1.0);\n\
//               /*gl_Position = vec4(vertex, 1.0);*/\n\
// 		vColor = color;\n\
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
// 	dest = [];
// CoordinateSystem.fromGeoTo3D(geo, dest)
// console.log("Worldcoordinates:");
// console.dir(dest);



// var style = new GlobWeb.FeatureStyle({
// 	iconUrl: null,
// 	//icon: Text.generateImageData("Coucou!"),
// 	pointMaxSize: 4000,
// 	radius: 10,
// 	renderer: "pulsar"
// });

// var layer = new GlobWeb.VectorLayer({
// 	style: style
// });
// globe.addLayer(layer);

// // var geo = [47, 15, 600];
// // var dest = CoordinateSystem.fromGeoTo3D(geo);
// // console.log("test: ");
// // console.dir(dest);

// var geoJSON = {
// 	"type": "Feature",
// 	"geometry": {
// 		"type": "Point",
// 		"coordinates": [15.439498, 47.070761]
// 	}
// }
// layer.addFeature(geoJSON);
// layer.animate(0, 4);

// var canvas = this.el;
// var poi;
// canvas.onclick = function(event) {
// 	//if (poi) layer.removeFeature(poi);

// 	var pos = globe.renderContext.getXYRelativeToCanvas(event);
// 	var lonlat = globe.getLonLatFromPixel(pos[0], pos[1]);
// 	poi = {
// 		geometry: {
// 			type: "Point",
// 			coordinates: lonlat
// 		}
// 	};
// 	layer.addFeature(poi);
// };