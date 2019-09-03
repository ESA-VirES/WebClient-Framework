/*global $ _ */

String.prototype.capitalizeFirstLetter = function () {
  return this.charAt(0).toUpperCase() + this.slice(1);
};


var padLeft = function (str, pad, size) {
  while (str.length < size) {
    str = pad + str;
  }
  return str;
};

var meanDate = function (date1, date2) {
  return new Date(date1.getTime() + (date2 - date1) / 2);
};

var getDateString = function (date) {
  return date.getUTCFullYear() + "-"
    + padLeft(String(date.getUTCMonth() + 1), "0", 2) + "-"
    + padLeft(String(date.getUTCDate()), "0", 2);
};

var getISODateString = function (date) {
  return getDateString(date) + "T";
};

var getISODateTimeString = function (date) {
  return getISODateString(date)
    + padLeft(String(date.getUTCHours()), "0", 2) + ":"
    + padLeft(String(date.getUTCMinutes()), "0", 2) + ":"
    + padLeft(String(date.getUTCSeconds()), "0", 2) + "."
    + padLeft(String(date.getUTCMilliseconds()), "0", 3) + "Z";
};

var getISOTimeString = function (date) {
  return padLeft(String(date.getUTCHours()), "0", 2) + ":"
    + padLeft(String(date.getUTCMinutes()), "0", 2) + ":"
    + padLeft(String(date.getUTCSeconds()), "0", 2) + "."
    + padLeft(String(date.getUTCMilliseconds()), "0", 3);
};

var htmlTemplate = function (selector, values) {
  var tmplString = $(selector).html();
  return _.template(tmplString, values);
};

var isValidTime = function (time) {

  // offset is the one after the first.
  var firstColonPos = time.indexOf(':');
  var secondColonPos = time.indexOf(':', firstColonPos + 1);
  var millisecondsPointPos = time.indexOf('.');

  if (firstColonPos != 2 || secondColonPos != 5 || millisecondsPointPos != 8) {
    return false;
  }

  var t = time.split(':');
  var h = t[0];
  var m = t[1];
  var s = t[2].split('.')[0];
  var ms = t[2].split('.')[1];
  if (isNaN(h) || isNaN(m) || isNaN(s) || isNaN(ms)) {
    return false;
  }

  return true;

};

var parseTime = function (time) {

  // offset is the one after the first.
  var firstColonPos = time.indexOf(':');
  var secondColonPos = time.indexOf(':', firstColonPos + 1);
  var millisecondsPointPos = time.indexOf('.');

  if (firstColonPos != 2 || secondColonPos != 5 || millisecondsPointPos != 8) {
    return false;
  }

  var t = time.split(':');
  var h = t[0];
  var m = t[1];
  var s = t[2].split('.')[0];
  var ms = t[2].split('.')[1];
  if (isNaN(h) || isNaN(m) || isNaN(s) || isNaN(ms)) {
    return false;
  }

  return [Number(h), Number(m), Number(s), Number(ms)];

};

var utc = function (year, month, day, hours, minutes, seconds, milliseconds) {
  var date = new Date(Date.UTC.apply(null, arguments));
  return date;
};

// TODO: move this to libcoverage.js
var getCoverageXML = function (coverageid, options) {
  if (!coverageid) {
    throw new Error("Parameters 'coverageid' is mandatory.");
  }
  options = options || {};
  var subsetCRS = options.subsetCRS || "http://www.opengis.net/def/crs/EPSG/0/4326";
  var params = [
    '<wcs:GetCoverage service="WCS" version="2.0.0" xmlns:wcs="http://www.opengis.net/wcs/2.0" xmlns:wcscrs="http://www.opengis.net/wcs/crs/1.0" xmlns:wcsmask="http://www.opengis.net/wcs/mask/1.0">',
    '<wcs:CoverageId>' + coverageid + '</wcs:CoverageId>',
  ];
  var extension = [];

  if (options.format)
    params.push("<wcs:format>" + options.format + "</wcs:format>");
  if (options.bbox && !options.subsetX && !options.subsetY) {
    options.subsetX = [options.bbox[0], options.bbox[2]];
    options.subsetY = [options.bbox[1], options.bbox[3]];
  }
  if (options.subsetX) {
    params.push('<wcs:DimensionTrim><wcs:Dimension crs="' + subsetCRS + '">x</wcs:Dimension>' +
                "<wcs:TrimLow>" + options.subsetX[0] + "</wcs:TrimLow>" +
                "<wcs:TrimHigh>" + options.subsetX[1] + "</wcs:TrimHigh></wcs:DimensionTrim>");
  }
  if (options.subsetY) {
    params.push('<wcs:DimensionTrim><wcs:Dimension crs="' + subsetCRS + '">y</wcs:Dimension>' +
                "<wcs:TrimLow>" + options.subsetY[0] + "</wcs:TrimLow>" +
                "<wcs:TrimHigh>" + options.subsetY[1] + "</wcs:TrimHigh></wcs:DimensionTrim>");
  }

  if (options.outputCRS) {
    /* the crs extension is not released. Mapserver expects a <wcs:OutputCRS>
     * in the root. Will stick to that atm, but requires a change in the future.
    */
    //extension.push("<wcscrs:outputCrs>" + options.outputCRS + "</wcscrs:outputCrs>");
    params.push("<wcs:OutputCrs>" + options.outputCRS + "</wcs:OutputCrs>");
  }

  // raises an exception in MapServer
  //extension.push("<wcscrs:subsettingCrs>" + subsetCRS + "</wcscrs:subsettingCrs>");

  if (options.mask) {
    extension.push("<wcsmask:polygonMask>" + options.mask + "</wcsmask:polygonMask>");
  }
  if (options.multipart) {
    params.push("<wcs:mediaType>multipart/related</wcs:mediaType>");
  }

  if (extension.length > 0) {
    params.push("<wcs:Extension>");
    for (var i = 0; i < extension.length; ++i) {
      params.push(extension[i]);
    }
    params.push("</wcs:Extension>");
  }
  params.push('</wcs:GetCoverage>');
  return params.join("");
};

var showMessage = function (level, message, timeout, additionalClasses) {
  var label = level.capitalizeFirstLetter();
  if (label === 'Danger') {label = 'Error';}
  if (label === 'Success') {label = 'Info';}
  var el = $(
    '<div style="padding-right:40px;" class="alert alert-' + level + ' ' + additionalClasses + '">' +
      '<button style="margin-right:-25px;" type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button>' +
      '<svg id="countdowncircle" width="10" height="10" viewbox="0 0 10 10"><path id="loader" transform="translate(5, 5)" /></svg>' +
      '<strong>' + label + '</strong>:<br/> ' + message +
    '</div>'
  );

  $("#error-messages").append(el);

  //var $loader = $('#loader');
  var alpha = 360, pi = Math.PI, time = timeout;

  function draw() {
    alpha--;

    var r = (alpha * pi / 180),
      x = Math.sin(r) * 5,
      y = Math.cos(r) * - 5,
      mid = (alpha <= 180) ? 0 : 1,
      animate = 'M 0 0 v -5 A 5 5 1 ' + mid + ' 1 ' + x + ' ' + y + ' z';

    if (alpha > 0) {
      setTimeout(draw, time); // Redraw
      el.find('path')[0].setAttribute('d', animate);
      //loader.setAttribute('d', animate);
    } else {
      el.remove();
    }
  }

  draw.call(el);
};



var saveProductStatus = function(product){
  var prevConf = JSON.parse(
      localStorage.getItem('productsConfiguration')
  );
  if(prevConf === null){
      prevConf = {};
  }
  var prdId = product.get('download').id;
  var origPars = product.get('parameters');
  var prodParams = {};

  for (var pk in origPars){
      prodParams[pk] = {
          range: origPars[pk].range,
          colorscale: origPars[pk].colorscale,
      }
      if(origPars[pk].selected){
          prodParams[pk]['selected'] = true;
      }
  }

  var prod = {
      visible: product.get('visible'),
      outlines: product.get('outlines'),
      opacity: product.get('opacity'),
      parameters: prodParams

  };

  // Save additional information for model product
  if(product.attributes.hasOwnProperty('components')){
      prod.components = product.get('components');
  }

  prevConf[prdId] = prod;

  localStorage.setItem(
      'productsConfiguration', JSON.stringify(prevConf)
  );

}


var savePrameterStatus = function (globals){
  var parConf = {};
  var uomSet = globals.swarm.get('uom_set');

  for (var pk in uomSet){
      var parC = {};
      for (var innerpk in uomSet[pk]){
          if(globals.swarm.satellites.hasOwnProperty(innerpk)){
              parC[innerpk] = {};
              if(uomSet[pk][innerpk].hasOwnProperty('color')){
                  parC[innerpk]['color'] = uomSet[pk][innerpk].color;
              }
              if(uomSet[pk][innerpk].hasOwnProperty('symbol')){
                  parC[innerpk]['symbol'] = uomSet[pk][innerpk].symbol;
              }
              if(uomSet[pk][innerpk].hasOwnProperty('lineConnect')){
                  parC[innerpk]['lineConnect'] = uomSet[pk][innerpk].lineConnect;
              }
              if(uomSet[pk][innerpk].hasOwnProperty('size')){
                  parC[innerpk]['size'] = uomSet[pk][innerpk].size;
              }
              if(uomSet[pk][innerpk].hasOwnProperty('alpha')){
                  parC[innerpk]['alpha'] = uomSet[pk][innerpk].alpha;
              }
              if(uomSet[pk][innerpk].hasOwnProperty('displayName')){
                  parC[innerpk]['displayName'] = uomSet[pk][innerpk].displayName;
              }
          }
      }
      if(!_.isEmpty(parC)){
          parConf[pk] = parC;
      }
  }
  // Save parameter style changes
  localStorage.setItem(
      'parameterConfiguration', 
      JSON.stringify(parConf)
  );
}