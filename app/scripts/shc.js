(function () {
  'use strict';
  var root = this;
  var dependencies = ['underscore'];

  function init() {

    function stripComment(line) {
      // strip comments stating by #
      var index = line.indexOf('#');
      if (index >= 0) {
        line = line.slice(0, index);
      }
      return line;
    }

    function TextFileReader(data, lineParser) {
      // construct object reading text by lines
      return {
        data: data,
        lineParser: lineParser || function (line) {return line;},
        readLine: function () {
          var data = this.data;
          var index = data.indexOf('\n');
          if (index < 0) return null;
          this.data = data.slice(index+1);
          return this.lineParser(data.slice(0, index+1));
        }
      };
    }

    function _parseShcHeader(reader) {
      // parse SHC file header - low-level parser
      var line;
      while((line = reader.readLine()) !== null) {
        if (line) break;
      }
      if (line === null) return null;
      var header = _.map(line.split(/\s+/).slice(0, 8), Number);
      if ((header.length !== 5)&&(header.length !== 7)) return null;
      var shcHeader = {
        max_degree: header[0],
        max_degree: header[1],
        ntime: header[2],
        spline_order: header[3],
        nstep: header[4],
      }
      line = reader.readLine();
      if (line === null) return null;
      shcHeader.times = _.map(line.split(/\s+/), Number);
      if (shcHeader.times.length !== shcHeader.ntime) return null;
      if (header.length === 7) {
        shcHeader.validity = {start: header[5], end: header[6]};
      } else if (shcHeader.spline_order === 1) {
        shcHeader.validity = {start: -Infinity, end: Infinity};
      } else {
        shcHeader.validity = {
          start: shcHeader.times[0],
          end: shcHeader.times[shcHeader.times.length-1],
        }
      }
      return shcHeader;
    }

    function parseShcHeader(data) {
      // parse SHC file header - high-level parser
      return _parseShcHeader(TextFileReader(
        data, function (line) {return stripComment(line).trim();}
      ));
    }

    function decimalYearToDate(decimalYear) {
      decimalYear = Math.max(1, Math.min(4000, decimalYear));
      var year = Math.floor(decimalYear);
      var fraction = decimalYear - year;
      var yearStart  = Date.parse(year+"-01-01");
      var yearEnd  = Date.parse((year+1)+"-01-01");
      return new Date(yearStart + (yearEnd - yearStart)*fraction);
    }

    return {
      decimalYearToDate: decimalYearToDate,
      parseShcHeader: parseShcHeader
    };
  }

  root.define(dependencies, init);
}).call(this);
