(function() {
  'use strict';

  var INPUT_DESCRIPTIONS = {
    'collection_ids': 'Products',
    'model_ids': 'Models',
    'begin_time': 'Start time',
    'end_time': 'End time',
    'filters': 'Filters'
  }


  var root = this;
  root.define([
    'backbone',
    'communicator',
    'globals',
    'models/DownloadModel',
    'hbs!tmpl/DownloadFilter',
    'hbs!tmpl/FilterTemplate',
    'hbs!tmpl/DownloadProcess',
    'hbs!tmpl/wps_retrieve_data_filtered',
    'hbs!tmpl/CoverageDownloadPost',
    'hbs!tmpl/wps_fetchFilteredDataAsync',
    'underscore',
    'w2ui',
    'w2popup'
  ],
  function( Backbone, Communicator, globals, m, DownloadFilterTmpl,
            FilterTmpl, DownloadProcessTmpl, wps_requestTmpl, CoverageDownloadPostTmpl, wps_fetchFilteredDataAsync ) {

    var DownloadProcessView = Backbone.Marionette.ItemView.extend({
      tagName: "div",
      el: '#download_processes',
      //id: "modal-start-download",
      className: "download_process",
      template: {
          type: 'handlebars',
          template: DownloadProcessTmpl
      },
      modelEvents: {
        "change": "render"
      },
      onBeforeRender: function(){
        this.collapse_open = $('#collapse-'+this.model.get('id')).hasClass('in');
      },
      onRender: function(){
        if(this.collapse_open){
          $('#collapse-'+this.model.get('id')).addClass('in');
          $('#'+this.model.get('id')+' a').removeClass('collapsed');
        }
      },

      initialize: function(options) {},
      onShow: function(view){}
    }),

    toggleDownloadButton = function(activate){
      if(!activate){
        $('#btn-start-download').prop('disabled', true);
        $('#btn-start-download').attr('title', 'Please wait until previous process is finished');
      }else{
        $('#btn-start-download').prop('disabled', false);
        $('#btn-start-download').removeAttr('title');
      }
      
    },


    DownloadProcessModel = Backbone.Model.extend({
      id: null,
      status_url: null,
      percentage: 0,
      percentage_descriptor: 'Loading ...',
      status: null,
      datainputs: null,
      creation_time: null,
      download_link: null,

      update: function() {

        var that = this;
        $.get(this.get('status_url'), 'xml')
          .done( function ( doc ){

            // Collect and fill data input information
            var datainputs = {};
            $(doc).find('DataInputs, wps\\:DataInputs').children().each(function(){
              var id = $(this).find('Identifier, ows\\:Identifier').text();

              if(id && INPUT_DESCRIPTIONS.hasOwnProperty(id)){
                var data = $(this).find('LiteralData, wps\\:LiteralData').text();
                if(data){
                  datainputs[INPUT_DESCRIPTIONS[id]] = data;
                }else{
                  data = $(this).find('ComplexData, wps\\:ComplexData').text();
                  if(data){
                    data = data.slice(1,-1);
                    datainputs[INPUT_DESCRIPTIONS[id]] = data;
                  }
                }
              }
            });

            var outf = $(doc).find('OutputDefinitions, wps\\:OutputDefinitions');
            if (outf){
              var mt = $(outf).find('Output, wps\\:Output').attr('mimeType');
              if (mt){
                datainputs['Output format'] = mt;
              }
            }

            var status = $(doc).find('Status, wps\\:Status');
            if (status && status.children().length > 0){
              if(status.children()[0].nodeName === 'wps:ProcessSucceeded'){
                if (that.get('status')=='ACCEPTED' ||  that.get('status')=='STARTED'){
                  // Previous status was still processing loading now finished
                  that.set('status', 'SUCCEEDED')
                  toggleDownloadButton(true);
                }
                that.set('percentage', 100);
                that.set('percentage_descriptor', 'Ready');
                var download_link = $(doc).find('Output, wps\\:Output').find('Reference, wps\\:Reference').attr('href');
                if(download_link){
                  that.set('download_link', download_link);
                }
              }
              if(status.children()[0].nodeName === 'wps:ProcessFailed'){
                if (that.get('status')=='ACCEPTED' ||  that.get('status')=='STARTED'){
                  // Previous status was still processing loading now finished
                  that.set('status', 'FAILED')
                  toggleDownloadButton(true);
                }
                var errmsg = $(doc).find('ExceptionText, ows\\:ExceptionText');
                if(errmsg){
                  datainputs['Error Message'] = errmsg.text();
                }

                that.set('percentage', 0);
                that.set('percentage_descriptor', 'Error while processing');
              }
              
              if (status.children().attr('percentCompleted') !== undefined){
                //toggleDownloadButton(false);
                var p = status.children().attr('percentCompleted');
                that.set('percentage', p);
                that.set('percentage_descriptor', (p+'%'));
                // Only update model if download view is open
                if(!$('#viewContent').is(':empty')){
                  setTimeout(function(){ that.update(); }, 2000);
                }
              } else if(status.children()[0].nodeName === 'wps:ProcessAccepted'){
                //toggleDownloadButton(false);
                that.set('percentage', 0);
                that.set('percentage_descriptor', 'Starting process ...');
                if(!$('#viewContent').is(':empty')){
                  setTimeout(function(){ that.update(); }, 2000);
                }
              }

            }
            if(datainputs && Object.keys(datainputs).length>0){
              that.set('datainputs', datainputs);
            }

            

          })
      }
    }),

    DownloadFilterView = Backbone.Marionette.ItemView.extend({
      tagName: "div",
      id: "modal-start-download",
      className: "panel panel-default download",
      template: {
          type: 'handlebars',
          template: DownloadFilterTmpl
      },

      initialize: function(options) {

        this.coverages = new Backbone.Collection([]);
        this.start_picker = null;
        this.end_picker = null;
        this.models = [];
        this.swarm_prod = [];
        this.loadcounter = 0;
        this.currentFilters = {};
        this.tabindex = 1;

      },

      createSubscript: function createSubscript(string){
        // Adding subscript elements to string which contain underscores
        var newkey = "";
        var parts = string.split("_");
        if (parts.length>1){
          newkey = parts[0];
          for (var i=1; i<parts.length; i++){
            newkey+=(" "+parts[i]).sub();
          }
        }else{
          newkey = string;
        }

        return newkey;
      },

      handleItemSelected: function handleItemSelected(evt){
        var selected = $('#addfilter').val();
        if(selected !== ''){
          this.currentFilters[selected] = [0,0];
          this.renderFilterList();
        }
      },


      onShow: function(view){

        this.listenTo(this.coverages, "reset", this.onCoveragesReset);
        this.$('.close').on("click", _.bind(this.onClose, this));
        this.$el.draggable({ 
          containment: "#content",
          scroll: false,
          handle: '.panel-heading'
        });

        this.$('#btn-start-download').on("click", _.bind(this.onStartDownloadClicked, this));

        $('#validationwarning').remove();

        this.updateJobs();

        var options = {};

        // Check for filters

        var filters = this.model.get("filter");
        if (typeof filters === 'undefined') {
          filters = {};
        }

        var aoi = this.model.get("AoI");
        if (aoi){
          filters["Longitude"] = [aoi.w, aoi.e];
          filters["Latitude"] = [aoi.s, aoi.n];
        }

        this.currentFilters = filters;

        //if (!$.isEmptyObject(filters)){
        this.renderFilterList();
        //}

        // Check for products and models
        var products;
        this.models = [];
        this.swarm_prod = [];

        // Initialise datepickers
        $.datepicker.setDefaults({
          showOn: "both",
          dateFormat: "dd.mm.yy"
        });

        var that = this;

        var timeinterval = this.model.get("ToI");



        this.start_picker = this.$('#starttime').datepicker({
          onSelect: function() {
            var start = that.start_picker.datepicker( "getDate" );
            var end = that.end_picker.datepicker( "getDate" );
            if(start>end){
              that.end_picker.datepicker("setDate", start);
            }
          }
        });
        this.start_picker.datepicker("setDate", timeinterval.start);

        this.end_picker = this.$('#endtime').datepicker({
          onSelect: function() {
            var start = that.start_picker.datepicker( "getDate" );
            var end = that.end_picker.datepicker( "getDate" );
            if(end<start){
              that.start_picker.datepicker("setDate", end);
            }
          }
        });
        this.end_picker.datepicker("setDate", timeinterval.end);

        // Prepare to create list of available parameters
        var available_parameters = [];

        products = this.model.get("products");
        // Separate models and Swarm products and add lists to ui
        _.each(products, function(prod){

            if(prod.get("download_parameters")){
              var par = prod.get("download_parameters");
              var new_keys = _.keys(par);
              _.each(new_keys, function(key){
                if(!_.find(available_parameters, function(item){
                  return item.id == key;
                })){
                  available_parameters.push({
                    id: key,
                    uom: par[key].uom,
                    description: par[key].name,
                  });
                }
              });

            }

            if(prod.get("processes")){
              var result = $.grep(prod.get("processes"), function(e){ return e.id == "retrieve_data"; });
              if (result)
                this.swarm_prod.push(prod);
            }

            if(prod.get("model"))
              this.models.push(prod);

        },this);

        var prod_div = this.$el.find("#productsList");
        prod_div.append('<div style="font-weight:bold;">Products</div>');

        prod_div.append('<ul style="padding-left:15px">');
        var ul = prod_div.find("ul");
        _.each(this.swarm_prod, function(prod){
          ul.append('<li style="list-style-type: circle; padding-left:-6px;list-style-position: initial;">'+prod.get("name")+'</li>');
        }, this);

        
        if (this.models.length>0){
          var mod_div = this.$el.find("#model");
          mod_div.append('<div><b>Models</b></div>');
          mod_div.append('<ul style="padding-left:15px">');
          ul = mod_div.find("ul");
          _.each(this.models, function(prod){
            ul.append('<li style="list-style-type: circle; padding-left:-6px;list-style-position: initial;">'+prod.get("name")+'</li>');
          }, this);
        }

        this.$el.find("#custom_parameter_cb").off();
        this.$el.find("#custom_download").empty();
        this.$el.find("#custom_download").html(
          '<div class="w2ui-field">'+
              '<div class="checkbox" style="margin-left:20px;"><label><input type="checkbox" value="" id="custom_parameter_cb">Custom download parameters</label></div>'+
              '<div style="margin-left:0px;"> <input id="param_enum" style="width:100%;"> </div>'+
          '</div>'
        );

        var subsetting_cb = '<div class="checkbox"><label><input type="checkbox" value="" id="custom_subsetting_cb">Custom time subsampling</label></div>';
        var subsettingFilter =
          '<div class="input-group" id=custom_subsetting_filter style="margin:7px">'+
            '<span class="form-control">'+
              'Time subsetting (Expected format ISO-8601 duration e.g. PT1H10M30S)'+
              '<textarea id="custom_subsetting_ta" rows="1" cols="20" style="float:right; resize:none;">PT10S</textarea>'+
            '</span>'+
        '</div>';

        this.$el.find("#custom_subsetting_cb").off();
        this.$el.find("#custom_subsetting").empty();
        this.$el.find("#custom_subsetting").append(subsetting_cb);

        $("#custom_subsetting_cb").click(function(evt){
          if ($('#custom_subsetting_cb').is(':checked')) {
            $("#custom_subsetting").append(subsettingFilter);
          }else{
            $("#custom_subsetting_filter").remove();
          }
        });

        this.$el.find("#custom_time_cb").off();
        this.$el.find("#custom_time").empty();
        /*this.$el.find("#custom_time").html(
            '<div class="checkbox" style="margin-left:0px;"><label><input type="checkbox" value="" id="custom_time_cb">Custom time selection</label></div><div id="customtimefilter"></div>'
        );*/

        this.$el.find('#custom_time_cb').click(function(){

          $('#customtimefilter').empty();

          if ($('#custom_time_cb').is(':checked')) {
           
            var timeinterval = that.model.get("ToI");
            var extent = [
              getISOTimeString(timeinterval.start),
              getISOTimeString(timeinterval.end)
            ];

            var name = "Time (hh:mm:ss.fff)";

            var $html = $(FilterTmpl({
                id: "timefilter",
                name: name,
                extent: extent
              })
            );
            $('#customtimefilter').append($html);
            $('#customtimefilter .input-group-btn button').removeClass();
            $('#customtimefilter .input-group-btn button').attr('class', 'btn disabled');
            
          }

        });

        var selected = [];
        // Check if latitude available
        if(_.find(available_parameters, function(item){return item.id == "Latitude";})){
          selected.push({id: "Latitude"});
        }
        //Check if Longitude available
        if(_.find(available_parameters, function(item){return item.id == "Longitude";})){
          selected.push({id: "Longitude"});
        }
        //Check if timestamp available
        if(_.find(available_parameters, function(item){return item.id == "Timestamp";})){
          selected.push({id: "Timestamp"});
        }
        //Check if radius available
        if(_.find(available_parameters, function(item){return item.id == "Radius";})){
          selected.push({id: "Radius"});
        }

        // See if magnetic data actually selected if not remove residuals
        var magdata = false;
        _.each(products, function(p, key){
          if(key.indexOf("MAG")!=-1){
            magdata = true;
          }
        });

        if(!magdata){
          available_parameters = _.filter(available_parameters, function(v){
            if(v.id.indexOf("_res_")!=-1){
              return false;
            }else{
              return true;
            }
          })
        }

        $('#param_enum').w2field('enum', { 
            items: _.sortBy(available_parameters, 'id'), // Sort parameters alphabetically 
            openOnFocus: true,
            selected: selected,
            renderItem: function (item, index, remove) {
                if(item.id == "Latitude" || item.id == "Longitude" ||
                   item.id == "Timestamp" || item.id == "Radius"){
                  remove = "";
                }
                var html = remove + that.createSubscript(item.id);
                return html;
            },
            renderDrop: function (item, options) {
              $("#w2ui-overlay").addClass("downloadsection");

              var html = '<b>'+that.createSubscript(item.id)+'</b>';
              if(item.uom != null){
                html += ' ['+item.uom+']';
              }
              if(item.description){
                html+= ': '+item.description;
              }
              //'<i class="fa fa-info-circle" aria-hidden="true" data-placement="right" style="margin-left:4px;" title="'+item.description+'"></i>';
              
              return html;
            },
            onRemove: function(evt){
              if(evt.item.id == "Radius" || evt.item.id == "Latitude" ||
                 evt.item.id == "Longitude" || evt.item.id == "Timestamp"){
                evt.preventDefault();
                evt.stopPropagation();
              }
            }
        });
        $('#param_enum').prop('disabled', true);
        $('#param_enum').w2field().refresh();

        this.$el.find("#custom_parameter_cb").click(function(evt){
          if ($('#custom_parameter_cb').is(':checked')) {
            $('#param_enum').prop('disabled', false);
            $('#param_enum').w2field().refresh();
          }else{
            $('#param_enum').prop('disabled', true);
            $('#param_enum').w2field().refresh();
          }
        });

      },

      updateJobs: function(){

        var url_jobs = '/ows?service=wps&request=execute&version=1.0.0&identifier=listJobs&RawDataOutput=job_list';

        $.get(url_jobs, 'json')
          .done(function( processes ){
            $('#download_processes').empty();

            if(processes.hasOwnProperty('vires:fetch_filtered_data_async')){

              var processes_to_save = 2;
              processes = processes['vires:fetch_filtered_data_async'];

              // Check if any process is active
              var active_processes = false;
              for (var i = 0; i < processes.length; i++) {
                if(processes[i].hasOwnProperty('status')){
                  if(processes[i]['status']=='ACCEPTED' || processes[i]['status']=='STARTED'){
                    active_processes = true;
                  }
                }
              }

              // Button will be enabled/disabled depending if there are active jobs
              toggleDownloadButton(!active_processes);

              var removal_processes = processes.splice(0,processes.length-processes_to_save );

              for (var i = 0; i < removal_processes.length; i++) {
                var remove_url = '/ows?service=WPS&request=Execute&identifier=removeJob&DataInputs=job_id='+removal_processes[i].id;
                $.get(remove_url);
              }

              if(processes.length>0){
                $('#download_processes').append('<div><b>Download links</b> (Process runs in background, panel can be closed and reopened at any time)</div>');
                $('#download_processes').append('<div style="float: left; margin-left:20px;"><b>Process started</b></div>');
                $('#download_processes').append('<div style="float: left; margin-left:100px;"><b>Status</b></div>');
                $('#download_processes').append('<div style="float: left; margin-left:240px;"><b>Info</b></div>');
                $('#download_processes').append('<div style="float: left; margin-left:110px;"><b>Link</b></div>');
              }

              for (var i = processes.length - 1; i >= 0; i--) {
                var m = new DownloadProcessModel({
                  id: processes[i].id,
                  creation_time: processes[i].created.slice(0, -13),
                  status_url: processes[i].url,
                  status: processes[i].status
                });
                var el = $('<div></div>');
                $('#download_processes').append(el);
                var proc_view = new DownloadProcessView({
                  el: el,
                  model: m
                });
                proc_view.render();
                m.update();
              }
            }else{
              // If there are no processes activate button
              toggleDownloadButton(true);
            }
          });


      },


      renderFilterList: function() {
        var filters = this.currentFilters;
        var fil_div = this.$el.find("#filters");
        fil_div.find('.w2ui-field').remove();
        $('#downloadAddFilter').remove();

        var available_uom = {};
        // Clone object
        _.each(globals.swarm.get('uom_set'), function(obj, key){
          available_uom[key] = obj;
        });

        _.each(_.keys(filters), function(key){

          // Check if filter part of parameters of currently selected products
          if (!available_uom.hasOwnProperty(key)){
            delete this.currentFilters[key];

          } else if($('#filters #'+key).length==0){
            var extent = filters[key].map(this.round);
            var name = "";
            var parts = key.split("_");
            if (parts.length>1){
              name = parts[0];
              for (var i=1; i<parts.length; i++){
                name+=(" "+parts[i]).sub();
              }
            }else{
              name = key;
            }

            var $html = $(FilterTmpl({
                id: key,
                name: name,
                extent: extent,
                index1: this.tabindex++,
                index2: this.tabindex++,
                index3: this.tabindex++
              })
            );

            
            fil_div.append($html);
          }

          
        }, this);

        // Create possible filter options based on possible download parameters
        var filteroptions = {};
        globals.products.each(function(model) {
          var dpars = model.get('download_parameters');
          if(model.get('visible')){
            for (var key in dpars){
              filteroptions[key] = dpars[key];
            }
          }
        });

         // We need to decompose all vector parameters so that filters can be 
        // applied correctly

        for (var key in filteroptions) {
          if(VECTOR_BREAKDOWN.hasOwnProperty(key)){
            for (var i = 0; i < VECTOR_BREAKDOWN[key].length; i++) {
              filteroptions[VECTOR_BREAKDOWN[key][i]] = {
                uom: filteroptions[key].uom,
                name: 'Component of '+filteroptions[key].name
              };
            }
            delete filteroptions[key];
          }
        }
        
        var filterkeys = _.keys(this.currentFilters);
        for (var i = 0; i < filterkeys.length; i++) {
          if(filteroptions.hasOwnProperty(filterkeys[i])){
            delete filteroptions[filterkeys[i]];
          }
        }


        // Remove unwanted parameters
        if(filteroptions.hasOwnProperty('Timestamp')){delete filteroptions['Timestamp'];}
        if(filteroptions.hasOwnProperty('timestamp')){delete filteroptions['timestamp'];}
        if(filteroptions.hasOwnProperty('q_NEC_CRF')){delete filteroptions['q_NEC_CRF'];}
        if(filteroptions.hasOwnProperty('GPS_Position')){delete filteroptions['GPS_Position'];}
        if(filteroptions.hasOwnProperty('LEO_Position')){delete filteroptions['LEO_Position'];}
        
           

        $('#filters').append(
          '<div class="w2ui-field"> <input type="list" id="addfilter"> <button id="downloadAddFilter" type="button" class="btn btn-default dropdown-toggle">Add filter <span class="caret"></span></button> </div>'
        );


        $( "#downloadAddFilter" ).click(function(){
          $("#addfilter").focus();
        });

        var that = this;

        $('#addfilter').w2field('list', { 
          items: _.keys(filteroptions).sort(),
          renderDrop: function (item, options) {
            var html = '<b>'+that.createSubscript(item.id)+'</b>';
            if(filteroptions[item.id].uom != null){
              html += ' ['+filteroptions[item.id].uom+']';
            }
            if(filteroptions[item.id].name != null){
              html+= ': '+filteroptions[item.id].name;
            }
            return html;
          }
        });

        $('#addfilter').change(this.handleItemSelected.bind(this));

        var that = this;

        // Remove previosly set click bindings
        this.$('.delete-filter').off('click');
        this.$('.delete-filter').on('click', function(evt){
          var item = this.parentElement.parentElement;
          this.parentElement.parentElement.parentElement.removeChild(item);
          delete that.currentFilters[item.id];
          that.renderFilterList();
        });

      },

      round: function(val){
        return val.toFixed(2);
      },

      fieldsValid: function(){
        var filter_elem = this.$el.find(".input-group");

        var valid = true;

        _.each(filter_elem, function(fe){
          var extent_elem = $(fe).find("textarea");

          for (var i = extent_elem.length - 1; i >= 0; i--) {

            if(extent_elem.context.id == 'timefilter'){
              if(!isValidTime(extent_elem[i].value)){
                $(extent_elem[i]).css('background-color', 'rgb(255, 215, 215)');
                valid = false;
              }else{
                $(extent_elem[i]).css('background-color', 'transparent');
              }
            }else if(extent_elem.context.id == 'custom_subsetting_filter'){
              if((extent_elem[i].value)[0]!=='P'){
                $(extent_elem[i]).css('background-color', 'rgb(255, 215, 215)');
                valid = false;
              }else{
                $(extent_elem[i]).css('background-color', 'transparent');
              }
            }else{
              if(!$.isNumeric(extent_elem[i].value)){
                $(extent_elem[i]).css('background-color', 'rgb(255, 215, 215)');
                valid = false;
              }else{
                $(extent_elem[i]).css('background-color', 'transparent');
              }
            }

          };
        });
        return valid;

      },


      onStartDownloadClicked: function() {
        $('#validationwarning').remove();
        // First validate fields
        if(!this.fieldsValid()){
          // Show ther eis an issue in the fields and return
          $('.panel-footer').append('<div id="validationwarning">There is an issue with the provided filters, please look for the red marked fields.</div>');
          return;
        }

        var $downloads = $("#div-downloads");
        var options = {};

        // format
        options.format = this.$("#select-output-format").val();

        if (options.format == "application/cdf"){
          options['time_format'] = "Unix epoch";
        }

        // time
        options.begin_time = this.start_picker.datepicker( "getDate" );
        options.begin_time = new Date(Date.UTC(options.begin_time.getFullYear(), options.begin_time.getMonth(),
        options.begin_time.getDate(), options.begin_time.getHours(), 
        options.begin_time.getMinutes(), options.begin_time.getSeconds()));
        options.begin_time.setUTCHours(0,0,0,0);
       

        options.end_time = this.end_picker.datepicker( "getDate" );
        options.end_time = new Date(Date.UTC(options.end_time.getFullYear(), options.end_time.getMonth(),
        options.end_time.getDate(), options.end_time.getHours(), 
        options.end_time.getMinutes(), options.end_time.getSeconds()));
        options.end_time.setUTCHours(23,59,59,999);
        //options.end_time.setUTCHours(0,0,0,0);
        

        // Add time subsetting option
        if($('#custom_subsetting_filter').length!=0){
          options.sampling_step = $('#custom_subsetting_ta').val();
        }


        // Rewrite time for start and end date if custom time is active
        if($("#timefilter").length!=0) {
          var s = parseTime($($("#timefilter").find('textarea')[1]).val());
          var e = parseTime($($("#timefilter").find('textarea')[0]).val());
          options.begin_time.setUTCHours(s[0],s[1],s[2],s[3]);
          options.end_time.setUTCHours(e[0],e[1],e[2],e[3]);
        }

        var bt_obj = options.begin_time;
        var et_obj = options.end_time;
        options.begin_time = getISODateTimeString(options.begin_time);
        options.end_time = getISODateTimeString(options.end_time);

        // products
        //options.collection_ids = this.swarm_prod.map(function(m){return m.get("views")[0].id;}).join(",");
        var retrieve_data = [];

        globals.products.each(function(model) {
          if (_.find(this.swarm_prod, function(p){ return model.get("views")[0].id == p.get("views")[0].id})) {
            var processes = model.get("processes");
            _.each(processes, function(process){
              if(process){
                switch (process.id){
                  case "retrieve_data":
                    retrieve_data.push({
                      layer:process.layer_id,
                      url: model.get("views")[0].urls[0]
                    });
                  break;
                }
              }
            }, this);
          }
        }, this);


        if (retrieve_data.length > 0){

          var collections = {};
          for (var i = retrieve_data.length - 1; i >= 0; i--) {
            var sat = false;
            var product_keys = _.keys(globals.swarm.products);
            for (var j = product_keys.length - 1; j >= 0; j--) {
              var sat_keys = _.keys(globals.swarm.products[product_keys[j]]);
              for (var k = sat_keys.length - 1; k >= 0; k--) {
                if (globals.swarm.products[product_keys[j]][sat_keys[k]] == retrieve_data[i].layer){
                  sat = sat_keys[k];
                }
              }
            }
            if(sat){
              if(collections.hasOwnProperty(sat)){
                collections[sat].push(retrieve_data[i].layer);
              }else{
                collections[sat] = [retrieve_data[i].layer];
              }
            }
           
          }

          var collection_keys = _.keys(collections);
          for (var i = collection_keys.length - 1; i >= 0; i--) {
            collections[collection_keys[i]] = collections[collection_keys[i]].reverse();
          }

          // Sort the "layers" to sort the master products based on priority
          for (var k in collections){
            collections[k].sort(productSortingFunction);
          }

          options["collections_ids"] = JSON.stringify(collections, Object.keys(collections).sort());
        }


        // models
        options.model_ids = this.models.map(function(m){return m.get("download").id;}).join(",");
        
        // composed model special case with model_expression
        var joinedActiveModels = options["model_ids"];
        if (joinedActiveModels.indexOf("Magnetic_Model") !== -1){
            var models = globals.products.filter(function (p) {
                return p.get('model');
            });
            
            var globalFound = models.find(function(model) {
                return model.get('download').id === "Magnetic_Model";
            }); 
            
            var newActiveModels = joinedActiveModels.replace("Magnetic_Model", "Magnetic_Model=" + globalFound.get("model_expression"));

            options["model_ids"] = newActiveModels;
        }else{
            options["model_ids"] = joinedActiveModels;
        }
        
        // custom model (SHC)
        var shc_model = _.find(globals.products.models, function(p){return p.get("shc") != null;});
        if(shc_model){
          options.shc = shc_model.get("shc");
        }


        // filters
        var filters = [];
        var filter_elem = $('#filters').find(".input-group");

        _.each(filter_elem, function(fe){

          var extent_elem = $(fe).find("textarea");
          if(extent_elem.context.id == 'timefilter'){
            return;
          }
          var extent = [];
          for (var i = extent_elem.length - 1; i >= 0; i--) {
            extent[i] = parseFloat(extent_elem[i].value);
          };
          // Make sure smaller value is first item
          extent.sort(function (a, b) { return a-b; });

          // Check to see if filter is on a vector component
          var original = false;
          var index = -1;
          _.each(VECTOR_BREAKDOWN, function(v, key){
            for (var i = 0; i < v.length; i++) {
              if(v[i] === fe.id){
                index = i;
                original = key;
              }
            }
            
          });

          if (original) {
            filters.push(original+"["+index+"]:"+ extent.join(","));
          }else{
            filters.push(fe.id+":"+ extent.join(","));
          }
        });

        options.filters = filters.join(";");

        // Custom variables
        if ($('#custom_parameter_cb').is(':checked')) {
          var variables = $('#param_enum').data('selected');
          variables = variables.map(function(item) {return item.id;});
          variables = variables.join(',');
          options.variables = variables;
        }else{
          // Use default parameters as described by download
          // product parameters in configuration
          var variables = [];

                 


          // Separate models and Swarm products and add lists to ui
          _.each(this.model.get("products"), function(prod){

              if(prod.get("download_parameters")){
                var par = prod.get("download_parameters");
                if(!prod.get("model")){
                  var new_keys = _.keys(par);
                  _.each(new_keys, function(key){
                    // Remove unwanted keys
                    if(key != "QDLat" && key != "QDLon" && key != "MLT" &&
                       key != "OrbitNumber" && key != "SunDeclination" && key != "SunRightAscension" && 
                       key != "SunHourAngle" && key != "SunAzimuthAngle" && key != "SunZenithAngle" &&
                       key != "B_NEC_resAC"){
                      if(!_.find(variables, function(item){
                        return item == key;
                      })){
                        variables.push(key);
                      }
                    }
                  });
                }
              }
          },this);
          options.variables = variables;
        }

        // TODO: Just getting last URL here think of how different urls should be handled
        var url = this.swarm_prod.map(function(m){return m.get("views")[0].urls[0];})[0];
        var req_data = wps_fetchFilteredDataAsync(options);
        var that = this;

        // Do some sanity checks before starting process

        // Calculate the difference in milliseconds
        var difference_ms = et_obj.getTime() - bt_obj.getTime();
        var days = Math.round(difference_ms/(1000*60*60*24));

        var sendProcessingRequest = function(){
          toggleDownloadButton(false);
          $.post( url, req_data, 'xml' )
            .done(function( response ) {
              that.updateJobs();
            })
            .error(function(resp){
              toggleDownloadButton(true);
            });
        };

        if (days>50 && filters.length==0){
          w2confirm('The current selection will most likely exceed the download limit, please make sure to add filters to further subset your selection. <br> Would you still like to proceed?')
            .yes(function () {
              sendProcessingRequest();
            });

        }else if (days>50){
          w2confirm('The current selected time interval is large and could result in a large download file if filters are not restrictive. The process runs in the background and the browser does not need to be open.<br>Are you sure you want to proceed?')
            .yes(function () {
              sendProcessingRequest();
            });
        }else{
          sendProcessingRequest();
        }

      },

      onClose: function() {
        Communicator.mediator.trigger("ui:close", "download");
        this.close();
      }

    });
    return {'DownloadFilterView':DownloadFilterView};
  });
}).call( this );
