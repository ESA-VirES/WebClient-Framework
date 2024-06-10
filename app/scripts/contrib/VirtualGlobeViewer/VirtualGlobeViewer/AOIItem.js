/*
 * AOIItem:
 *
 * Stores a single selection represented by a group of Points.
 *
 * Author: Martin Hecher <martin.hecher@fraunhofer.at>
 *
 * License: TBD
 */

define(['./Point',
  'virtualglobeviewer/GlobWeb'
], function (Point, GlobWeb) {

  function AOIItem(layer, base_altitude) {
    this._coords = [];
    this._feature = null;
    this._layer = layer;
    this._baseAltitude = base_altitude || 30000;
    this._height = 0;
    this._color = [1, 0.5, 0.1, 0.5];
  }

  AOIItem.prototype.setUnclosedCoordinates = function (coords) {
    this._coords = coords;
  };

  AOIItem.prototype.setColor = function (color) {
    this._color = color;
  };

  AOIItem.prototype.add = function (point) {
    this._coords.push(point);
  };

  AOIItem.prototype.clear = function () {
    if (this._feature) {
      this._layer.removeFeature(this._feature);
    }
    this._coords = [];
  };

  AOIItem.prototype.setHeight = function (height) {
    this._height = height;
  };

  AOIItem.prototype.getNumPoints = function () {
    return this._coords.length;
  };

  AOIItem.prototype.render = function (height) {
    var coords = this._projectOnSurface(this._coords, this._baseAltitude, 0);

    var strokeColor = this._color;
    var fillColor = this._color;
    fillColor[3] = 0.5;

    var style = new GlobWeb.FeatureStyle({
      fillColor: this._color,
      strokeColor: strokeColor,
      extrude: true,
      fill: true
    });

    this._feature = {
      "geometry": {
        "type": "Polygon",
        "coordinates": coords
      },
      "properties": {
        "style": style
      }
    };

    this._layer.addFeature(this._feature);
  };

  AOIItem.prototype.getStartPoint = function () {
    return this._coords[0];
  };

  AOIItem.prototype._projectOnSurface = function (coords, height, grid_resolution) {
    var grid_coords = [];

    if (grid_resolution === 0) {
      grid_coords = this._convertToGeoJSON(coords, height);
    } else {
      console.log("[AOIItemTool::projectOnSurface] NIY");

      // FIXXME: not ready for primetime yet:

      // 	var tl = _points[0];
      // 	var tr = _points[1];
      // 	var br = _points[2];
      // 	var bl = _points[3];

      // 	var grid = [tl];

      // 	for (var t = 0; t <= 1; t = t + 0.1) {
      // 		grid.push(Point.interpolate(tl, tr, t));
      // 	}

      // 	for (var t = 0; t <= 1; t = t + 0.1) {
      // 		grid.push(Point.interpolate(br, bl, t));
      // 	}

      // 	grid.push(tl);

      // 	var coords = [];
      // 	for (var idx in grid) {
      // 		var p = grid[idx];
      // 		coords.push([p.x, p.y]);
      // 		console.log("added point: (" + p.x + ", " + p.y + ")");
      // 	}
    }

    return grid_coords;
  };

  AOIItem.prototype._convertToGeoJSON = function (verts, altitude) {
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

  AOIItem.prototype.toJSON = function () {
    return this._feature;
  };

  return AOIItem;

}); // end module definition