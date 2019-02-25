(function() {
    'use strict';

    var root = this;

    root.define([
        'backbone',
        'communicator',
        'globals',
        'bower_components/choices.js/assets/scripts/dist/choices.js',
        'hbs!tmpl/LayerSettings',
        'hbs!tmpl/wps_eval_model_GET',
        'hbs!tmpl/wps_eval_composed_model_GET',
        'hbs!tmpl/wps_eval_model',
        'hbs!tmpl/wps_eval_composed_model',
        'hbs!tmpl/wps_eval_model_diff',
        'underscore',
        'plotty'
    ],

    function( Backbone, Communicator, globals, Choices, LayerSettingsTmpl, evalModelTmpl,evalModelTmplComposed, evalModelTmpl_POST, evalModelTmplComposed_POST, tmplEvalModelDiff ) {

        var LayerSettings = Backbone.Marionette.Layout.extend({

            template: {type: 'handlebars', template: LayerSettingsTmpl},
            className: "panel panel-default optionscontrol not-selectable",
            colorscaletypes : [
                'coolwarm', 'rainbow', 'jet', 'diverging_1', 'diverging_2',
                'blackwhite','viridis','inferno', 'hsv','hot','cool',
                'spring', 'summer','autumn','winter','bone','copper','ylgnbu',
                'greens','ylorrd','bluered', 'portland', 'blackbody','earth',
                'electric','magma','plasma'
            ],

            initialize: function(options) {
                this.selected = null;
                this.plot = new plotty.plot({
                    colorScale: 'jet',
                    domain: [0,1]
                });
                this.selected_satellite = "Alpha";
                this.colorscaletypes = _.sortBy(this.colorscaletypes, function (c) {return c;});
            },

            renderView: function(){
                // Unbind first to make sure we are not binding to many times
                this.stopListening(Communicator.mediator, "layer:settings:changed", this.onParameterChange);

                // Event handler to check if tutorial banner made changes to a model in order to redraw settings
                // If settings open rerender view to update changes
                this.listenTo(Communicator.mediator, "layer:settings:changed", this.onParameterChange);

                this.$(".panel-title").html('<h3 class="panel-title"><i class="fa fa-fw fa-sliders"></i> ' + this.current_model.get("name") + ' Settings</h3>');

                this.$('.close').on("click", _.bind(this.onClose, this));
                this.$el.draggable({ 
                    containment: "#main",
                    scroll: false,
                    handle: '.panel-heading'
                });
                var options = this.current_model.get("parameters");
                var height = this.current_model.get("height");
                var outlines = this.current_model.get("outlines");
                var showColorscale = this.current_model.get("showColorscale");
                var protocol = this.current_model.get("views")[0].protocol;
                var keys = _.keys(options);
                var option = '';
                var contours = this.current_model.get("contours");
                //var 

                var that = this;

                _.each(keys, function(key){
                    if(options[key].selected){
                        that.selected = key;
                        option += '<option value="'+ key + '" selected>' + options[key].name + '</option>';
                    }else{
                        option += '<option value="'+ key + '">' + options[key].name + '</option>';
                    }
                });

                this.$("#options").empty();

                this.$("#options").append(option);

                // Check if selected is not inside the available options
                // This happens if residuals were selected for the layer and
                // then the model was removed also removing the residuals parameter
                // from the cotnext menu.
                // If this happens the visualized parameter needs to be changed
                if(!options.hasOwnProperty(this.selected)){
                    this.onOptionsChanged();
                }else{

                    if(options[this.selected].description){
                        this.$("#description").text(options[this.selected].description);
                    }

                    if(options[that.selected].hasOwnProperty("logarithmic")){
                        this.addLogOption(options);
                    }

                    this.$("#options").unbind();
                    // Add event handler for change in drop down selection
                    this.$("#options").change(this.onOptionsChanged.bind(this));

                    // Set values for color scale ranges
                    this.$("#range_min").val(options[this.selected].range[0]);
                    this.$("#range_max").val(options[this.selected].range[1]);
                    
                    // Register necessary key events
                    this.registerKeyEvents(this.$("#range_min"));
                    this.registerKeyEvents(this.$("#range_max"));
                    

                    var colorscale_options = "";
                    var selected_colorscale;
                    _.each(this.colorscaletypes, function(colorscale){
                        if(options[that.selected].colorscale == colorscale){
                            selected_colorscale = colorscale;
                            colorscale_options += '<option value="'+ colorscale + '" selected>' + colorscale + '</option>';
                        }else{
                            colorscale_options += '<option value="'+ colorscale + '">' + colorscale + '</option>';
                        }
                    });

                    this.$("#style").unbind();

                    this.$("#style").empty();
                    this.$("#style").append(colorscale_options);

                    this.$("#style").change(function(evt){
                        var selected = $(evt.target).find("option:selected").text();
                        selected_colorscale = selected;
                        options[that.selected].colorscale = selected;
                        that.current_model.set("parameters", options);

                        if(options[that.selected].hasOwnProperty("logarithmic"))
                            that.createScale(options[that.selected].logarithmic);
                        else
                            that.createScale();

                        Communicator.mediator.trigger("layer:parameters:changed", that.current_model.get("name"));
                    });

                    this.$("#opacitysilder").unbind();
                    this.$("#opacitysilder").val(this.current_model.attributes.opacity*100);
                    this.$("#opacitysilder").on("input change", function(){
                        var opacity = Number(this.value)/100;
                        that.current_model.set("opacity", opacity);
                        Communicator.mediator.trigger('productCollection:updateOpacity', {model:that.current_model, value:opacity});
                    });

                    

                    if(!(typeof outlines === 'undefined')){
                        var checked = "";
                        if (outlines)
                            checked = "checked";

                        $("#outlines input").unbind();
                        $("#outlines").empty();
                        this.$("#outlines").append(
                            '<form style="vertical-align: middle;">'+
                            '<label class="valign" for="outlines" style="width: 120px;">Outlines </label>'+
                            '<input class="valign" style="margin-top: -5px;" type="checkbox" name="outlines" value="outlines" ' + checked + '></input>'+
                            '</form>'
                        );

                        this.$("#outlines input").change(function(evt){
                            var outlines = !that.current_model.get("outlines");
                            that.current_model.set("outlines", outlines);
                            Communicator.mediator.trigger("layer:outlines:changed", that.current_model.get("views")[0].id, outlines);
                        });
                    }

                    if(!(typeof showColorscale === 'undefined')){
                        var checked = "";
                        if (showColorscale)
                            checked = "checked";

                        $("#showColorscale input").unbind();
                        $("#showColorscale").empty();
                        this.$("#showColorscale").append(
                            '<form style="vertical-align: middle;">'+
                            '<label class="valign" for="outlines" style="width: 120px; margin">Legend </label>'+
                            '<input class="valign" style="margin-top: -5px;" type="checkbox" name="outlines" value="outlines" ' + checked + '></input>'+
                            '</form>'
                        );

                        this.$("#showColorscale input").change(function(evt){
                            var showColorscale = !that.current_model.get("showColorscale");
                            that.current_model.set("showColorscale", showColorscale);
                            Communicator.mediator.trigger("layer:colorscale:show", that.current_model.get("download").id);
                        });
                    }


                    if(!(typeof this.current_model.get("coefficients_range") === 'undefined') && this.current_model.get("name") !== 'Composed_Model'){

                        this.$("#coefficients_range").empty();

                        this.$("#coefficients_range").append(
                        '<li style="margin-top: 5px;">'+
                            '<label for="coefficients_range_min" style="width: 120px;">Coefficients range</label>'+
                            '<input id="coefficients_range_min" type="text" style="width:30px;"/>'+
                            '<input id="coefficients_range_max" type="text" style="width:30px; margin-left:8px"/>'+
                        '</li>'+
                        '<p style="font-size:0.85em; margin-left:130px;"> [-1,-1]: No range limitation</p>'
                        );

                        this.$("#coefficients_range_min").val(this.current_model.get("coefficients_range") [0]);
                        this.$("#coefficients_range_max").val(this.current_model.get("coefficients_range") [1]);

                        // Register necessary key events
                        this.registerKeyEvents(this.$("#coefficients_range_min"));
                        this.registerKeyEvents(this.$("#coefficients_range_max"));
                        
                    }   

                    if (protocol == "WPS"){
                        this.$("#shc").empty();
                        this.$("#shc").append(
                            '<p>Spherical Harmonics Coefficients</p>'+
                            '<div class="myfileupload-buttonbar ">'+
                                '<label class="btn btn-default shcbutton">'+
                                '<span><i class="fa fa-fw fa-upload"></i> Upload SHC File</span>'+
                                '<input id="upload-selection" type="file" accept=".shc" name="files[]" />'+
                              '</label>'+
                          '</div>'
                        );

                        this.$("#upload-selection").unbind();
                        this.$("#upload-selection").change(this.onUploadSelectionChanged.bind(this));

                        if(this.current_model.get('shc_name')){
                            that.$("#shc").append('<p id="filename" style="font-size:.9em;">Selected File: '+this.current_model.get('shc_name')+'</p>');
                        }
                        
                    }
                    
                    if((this.current_model.get("name") === 'Composed_Model')){
                      this.createApplyButton();
                      //composed model additional fields
                      this.$("#composed_model_compute").empty();
                      this.$("#composed_model_compute").append(`
                      <select class="form-control" id="choices-multiple-remove-button" placeholder="Composed model - Choose or type" multiple>
                      </select>`)
                      
                      var models = globals.products.filter(function (p) {
                          return p.get('model');
                      });
                      
                      for (var i = 0; i < models.length; i++) {
                         // initial choices list preparation
                          var id = models[i].get('download').id;
                          var coefficients = models[i].get('coefficients_range');
                          var selectedComposed = models[i].get('selectedComposed');
                          var sign = models[i].get('sign');
                          // do not use composed_model for creation of a new composed_model
                          if (id !== 'Composed_Model') {
                              $('#choices-multiple-remove-button').append(
                                `<option value=${id} ${selectedComposed?'selected':''}>${id}</option>`
                              );
                              // creating a object storage structure on the holding div element through .data() for later retrieval
                              // reference to models[i].attributes.coefficients changes the source, because it is a list? other immutable attributes are unmodified, thus setting them later when changes are applied
                              $('#composed_model_compute').data(id,{'sign':sign,'id':id,'coefficients':coefficients,'selectedComposed':selectedComposed}); 
                          }
                      }

                      //create a Choices modified template
                      var example = new Choices('#choices-multiple-remove-button', {
                        // inline onclicks with stopPropagation etc. are there to avoid binded Choices onclick and onkeydown, which made forms unclickable
                          removeItemButton: true,
                          callbackOnCreateTemplates: function(template) {
                              return {
                                  item: (classNames) => {
                                    // reason for this ugly inline event stuff mentioned above
                                    var id = classNames.value;
                                    var values = $('#composed_model_compute').data(id);
                                    // prevent click from Choices, focus and select the form
                                    var onClickFunctionString = 'event.stopPropagation();event.target.focus();event.target.select();';
                                    // prevent focus and writing into search div of choices
                                    var onKeyDownFunctionString = 'event.stopPropagation();';
                                    // handle $.data() change of data holding object so template loads it properly
                                    var onFormLeaveFunctionStringMin = 'var dataParent=$(this)[0].parentNode.parentNode.getAttribute(\'data-value\');$(\'#composed_model_compute\').data(dataParent).coefficients[0]=$(this).val();'
                                    var onFormLeaveFunctionStringMax = 'var dataParent=$(this)[0].parentNode.parentNode.getAttribute(\'data-value\');$(\'#composed_model_compute\').data(dataParent).coefficients[1]=$(this).val();'
                                    var onCustomModelOperandClick = 'event.stopPropagation();var dataParent = $(this)[0].parentNode.getAttribute(\'data-value\');var signData =$(\'#composed_model_compute\').data(dataParent).sign;var newSign=(signData===\'+\' ? \'-\' : \'+\');$(this).attr(\'value\', newSign);$(\'#composed_model_compute\').data(dataParent).sign=newSign;';
                                    // TODO: when custom model used, add option to add SHC to template as another button next to X sign
                                    if (id === 'Custom_Model') {
                                    }
                                      return template(`
                                        <div class="choices__item choices__item--selectable data-item composed_model_choices_holding_div"
                                         data-id="${classNames.id}" data-value="${classNames.value}" data-deletable}>
                                         <input type="button" value="${values.sign}" class="composed_model_operation_operand btn-info" onclick="${onCustomModelOperandClick}">
                                          <span class="composed_model_operation_label">${values.id}</span>
                                          <button type="button" class="composed_model_delete_button choices__button"  data-button> Remove item </button>
                                          <div class="degree_range_selection_input">
                                            <input type="text" class="composed_model_operation_coefficient_min" value="${values.coefficients[0]}" onclick="${onClickFunctionString}" onkeydown="${onKeyDownFunctionString}" onblur="${onFormLeaveFunctionStringMin}">
                                            <input type="text" class="composed_model_operation_coefficient_max"  value="${values.coefficients[1]}" onclick="${onClickFunctionString}" onkeydown="${onKeyDownFunctionString}" onblur="${onFormLeaveFunctionStringMax}">	
                                          </div>
                                        </div>
                                        `);
                                  }
                              };
                          }
                      });
                      //save info about selected elements to data model
                      example.passedElement.addEventListener('addItem', function(event) {
                        var dataParent = event.detail.value;
                        $('#composed_model_compute').data(dataParent).selectedComposed=true;
                      }, false);
                      example.passedElement.addEventListener('removeItem', function(event) {
                        var dataParent = event.detail.value;
                        $('#composed_model_compute').data(dataParent).selectedComposed=false;
                      }, false);
                    } else{ //another model than composed
                      this.$("#composed_model_compute").empty();                    
                    }


                    if(options[this.selected].hasOwnProperty("logarithmic"))
                        this.createScale(options[that.selected].logarithmic);
                    else
                        this.createScale();

                    this.createHeightTextbox(this.current_model.get("height"));
                }


                
                /*if(!(typeof contours === 'undefined')){
                    var checked = "";
                    if (contours)
                        checked = "checked";

                    $("#contours input").unbind();
                    $("#contours").empty();

                    this.$("#contours").append(
                        '<form style="vertical-align: middle;">'+
                        '<label class="valign" for="contours" style="width: 120px;">Contours/Isolines </label>'+
                        '<input class="valign" style="margin-top: -5px;" type="checkbox" name="contours" value="contours" ' + checked + '></input>'+
                        '</form>'
                    );

                    this.$("#contours input").change(function(evt){
                        var contours = !that.current_model.get("contours");
                        that.current_model.set("contours", contours);
                        Communicator.mediator.trigger("layer:parameters:changed", that.current_model.get("name"));
                    });
                }*/

                if(this.selected == "Fieldlines"){
                    $("#coefficients_range").hide();
                    $("#opacitysilder").parent().hide();
                    // Check if there is a selection available if not, show message

                    // Check for possible already available selection
                    if(localStorage.getItem('areaSelection') === null || 
                       !JSON.parse(localStorage.getItem('areaSelection')) ) {
                            showMessage(
                                'success',
                                'In order to visualize fieldlines please select an area with the bounding box tool.',
                                 35
                            );
                    }
                }else{
                    $("#coefficients_range").show();
                    $("#opacitysilder").parent().show();
                }

            },

            onShow: function(view){

                var that = this;

                if(this.model.attributes.hasOwnProperty("differenceTo")){
                    // Add options for three satellites
                    $("#difference_selection").off();
                    $("#difference_selection").empty();
                    $("#difference_selection").append('<label for="satellite_selec" style="width:120px;">Model difference </label>');
                    $("#difference_selection").append('<select style="margin-left:4px;" name="difference_selec" id="difference_selec"></select>');


                    var models = globals.products.filter(function (p) {
                        return p.get('model');
                    });

                    for (var i = 0; i < models.length; i++) {
                        var selected = '';
                        var name = models[i].get('name');
                        var id = models[i].get('download').id;
                        if(this.model.get('differenceTo') === id){
                            selected = 'selected';
                        }
                        if(id !== this.model.get('download').id && id!=='Custom_Model'){
                            $('#difference_selec').append('<option value="'+id+'"'+selected+'>'+name+'</option>');
                        }
                    }
                    if(this.model.get('differenceTo') === null){
                        $('#difference_selec').prepend('<option value="none" selected>-none-</option>');
                    }else{
                        
                        $('#difference_selec').prepend('<option value="none">-none-</option>');
                    }

                    $("#difference_selection").on('change', function(){
                        var differenceModel = $("#difference_selection").find("option:selected").val();
                        if(differenceModel==='none'){
                            differenceModel = null;
                        }
                        that.model.set('differenceTo', differenceModel);
                        that.onOptionsChanged();
                    });
                }

                if(this.model.get("containerproduct")){
                    // Add options for three satellites
                    $("#satellite_selection").off();
                    $("#satellite_selection").empty();
                    $("#satellite_selection").append('<label for="satellite_selec" style="width:120px;">Satellite </label>');
                    $("#satellite_selection").append('<select style="margin-left:4px;" name="satellite_selec" id="satellite_selec"></select>');

                    if( globals.swarm.products.hasOwnProperty(this.model.get('id')) ){
                        var options = Object.keys(globals.swarm.products[this.model.get('id')]);
                        for (var i = 0; i < options.length; i++) {
                            var selected = '';
                            if (options[i] == 'Alpha'){
                                selected = 'selected';
                            }
                            $('#satellite_selec').append('<option value="'+options[i]+'"'+selected+'>'+options[i]+'</option>');
                        }
                    }

                    $("#satellite_selec option[value="+this.selected_satellite+"]").prop("selected", "selected");

                    var model = null;
                    globals.products.forEach(function(p){
                        if(p.get("download").id == globals.swarm.products[that.model.get("id")][that.selected_satellite]){
                            model = p;
                        }
                    });
                    this.current_model = model;

                    $("#satellite_selection").on('change', function(){
                        that.selected_satellite = $("#satellite_selection").find("option:selected").val();
                        var model = null;
                        globals.products.forEach(function(p){
                            if(p.get("download").id == globals.swarm.products[that.model.get("id")][that.selected_satellite]){
                                model = p;
                            }
                        });
                        that.current_model = model;
                        that.renderView();
                    });

                }else{
                    this.current_model = this.model;
                }
                this.renderView();
            },

            onClose: function() {
                this.close();
            }, 

            onParameterChange: function(){
                this.onShow();
            },

            onOptionsChanged: function(){

                var options = this.current_model.get("parameters");

                if(options.hasOwnProperty(this.selected)){
                    delete options[this.selected].selected;
                }

                $("#description").empty();

                this.selected = $("#options").find("option:selected").val();

                this.$("#style").empty();
                var colorscale_options = "";
                var selected_colorscale;
                _.each(this.colorscaletypes, function(colorscale){
                    if(options[this.selected].colorscale == colorscale){
                        selected_colorscale = colorscale;
                        colorscale_options += '<option value="'+ colorscale + '" selected>' + colorscale + '</option>';
                    }else{
                        colorscale_options += '<option value="'+ colorscale + '">' + colorscale + '</option>';
                    }
                }, this);

                this.$("#style").append(colorscale_options);

                $("#range_min").val(options[this.selected].range[0]);
                $("#range_max").val(options[this.selected].range[1]);
                
                this.createScale();


                if(options[this.selected].hasOwnProperty("logarithmic")){
                    this.addLogOption(options);

                }else{
                    this.$("#logarithmic").empty();
                }

                options[this.selected].selected = true;

                if(options[this.selected].description){
                    this.$("#description").text(options[this.selected].description);
                }

                this.createHeightTextbox(this.current_model.get("height"));

                if(this.selected == "Fieldlines"){
                    $("#coefficients_range").hide();
                    $("#opacitysilder").parent().hide();
                    // Check for possible already available selection
                    if(localStorage.getItem('areaSelection') === null || 
                       !JSON.parse(localStorage.getItem('areaSelection')) ) {
                            showMessage(
                                'success',
                                'In order to visualize fieldlines please select an area using the "Select Area" button in the globe view.',
                                 35
                            );
                    }
                }else{
                    $("#coefficients_range").show();
                    $("#opacitysilder").parent().show();
                }

                // request range for selected parameter if layer is of type model
                if(this.current_model.get("model") && 
                    this.selected != "Fieldlines" /*&& 
                    this.current_model.get("differenceTo") === null*/){

                    var that = this;

                    var sel_time = Communicator.reqres.request('get:time');

                    if(this.current_model.get("views")[0].id == "shc" && 
                        this.current_model.get("differenceTo") === null){

                        if(this.current_model.attributes.hasOwnProperty("shc")){

                            var payload = evalModelTmpl_POST({
                                "model": "Custom_Model",
                                "variable": this.selected,
                                "begin_time": getISODateTimeString(sel_time.start),
                                "end_time": getISODateTimeString(sel_time.end),
                                "elevation": this.current_model.get("height"),
                                "coeff_min": this.current_model.get("coefficients_range")[0],
                                "coeff_max": this.current_model.get("coefficients_range")[1],
                                "shc": this.current_model.get('shc'),
                                "height": 24,
                                "width": 24,
                                "getonlyrange": true
                            });

                            $.post(this.current_model.get("download").url, payload)
                                .success(this.handleRangeRespone.bind(this))
                                .fail(this.handleRangeResponseError)
                                .always(this.handleRangeChange.bind(this));
                        }

                    }else if(this.current_model.get("differenceTo") !== null){

                        var product = this.current_model;
                        var refProd = globals.products.filter(function(p){
                            return p.get('download').id === product.get('differenceTo');
                        });

                        var shc = defaultFor(refProd[0].get('shc'), product.get('shc'));

                        var payload = tmplEvalModelDiff({
                                'model': product.get("download").id,
                                'reference_model': refProd[0].get("download").id,
                                "variable": this.selected,
                                "begin_time": getISODateTimeString(sel_time.start),
                                "end_time": getISODateTimeString(sel_time.end),
                                "elevation": this.current_model.get("height"),
                                "coeff_min": this.current_model.get("coefficients_range")[0],
                                "coeff_max": this.current_model.get("coefficients_range")[1],
                                "shc": shc,
                                "height": 24,
                                "width": 24,
                                "getonlyrange": true
                            });

                            $.post(this.current_model.get("download").url, payload)
                                .success(this.handleRangeRespone.bind(this))
                                .fail(this.handleRangeResponseError);
                    } else if (this.current_model.get("download").id === "Composed_Model"){

                        var req = evalModelTmplComposed({
                            url: this.current_model.get("download").url,
                            model_expression: encodeURIComponent(this.current_model.get("model_expression")),
                            variable: this.selected,
                            begin_time: getISODateTimeString(sel_time.start),
                            end_time: getISODateTimeString(sel_time.end),
                            elevation: this.current_model.get("height")
                        });

                        $.get(req)
                            .success(this.handleRangeRespone.bind(this))
                            .fail(this.handleRangeResponseError)
                            .always(this.handleRangeChange.bind(this));
                    }else{

                        var req = evalModelTmpl({
                            url: this.current_model.get("download").url,
                            model: this.current_model.get("download").id,
                            variable: this.selected,
                            begin_time: getISODateTimeString(sel_time.start),
                            end_time: getISODateTimeString(sel_time.end),
                            coeff_min: this.current_model.get("coefficients_range")[0],
                            coeff_max: this.current_model.get("coefficients_range")[1],
                            elevation: this.current_model.get("height")
                        });

                        $.get(req)
                            .success(this.handleRangeRespone.bind(this))
                            .fail(this.handleRangeResponseError)
                            .always(this.handleRangeChange.bind(this));
                    }
                }else{
                    Communicator.mediator.trigger("layer:parameters:changed", this.current_model.get("name"));
                }

            },

            registerKeyEvents: function(el){
                var that = this;
                el.keypress(function(evt) {
                    if(evt.keyCode == 13){ //Enter pressed
                        evt.preventDefault();
                        that.applyChanges();
                    }else{
                        that.createApplyButton();
                    }
                });

                el.keyup(function(evt) {
                    if(evt.keyCode == 8){ //Backspace clicked
                        that.createApplyButton();
                    }
                });

                // Add click event to select text when clicking or tabbing into textfield
                el.click(function () { $(this).select(); });
            },

            createApplyButton: function(){
                var that = this;
                if($("#changesbutton").length == 0){
                    $("#applychanges").append('<button type="button" class="btn btn-default" id="changesbutton" style="width: 100%;"> Apply changes </button>');
                    $("#changesbutton").click(function(evt){
                        that.applyChanges();
                    });
                }
            },

            handleRangeRespone: function(response){
                var options = this.current_model.get("parameters");
                var resp = response.split(',');
                var range = [Number(resp[1]), Number(resp[2])];
                // Make range "nicer", rounding depending on extent
                range = d3.scale.linear().domain(range).nice().domain();
                $("#range_min").val(range[0]);
                $("#range_max").val(range[1]);
                options[this.selected].range = range;
                this.current_model.set("parameters", options);
                this.createScale();
                Communicator.mediator.trigger("layer:parameters:changed", this.current_model.get("name"));
            },

            handleRangeResponeSHC: function(evt, response){
                this.handleRangeRespone(response);
                var params = { name: this.current_model.get("name"), isBaseLayer: false, visible: false };
                Communicator.mediator.trigger('map:layer:change', params);
                Communicator.mediator.trigger("file:shc:loaded", evt.target.result);
                Communicator.mediator.trigger("layer:activate", this.current_model.get("views")[0].id);
            },

            handleRangeResponseError: function(response){
                showMessage(
                    'warning', 
                    'There is a problem requesting the range values for the color scale,'+
                    ' please revise and set them to adequate values if necessary.', 15
                );
            },

            handleRangeChange: function(){
                var options = this.current_model.get("parameters");
                $("#range_min").val(options[this.selected].range[0]);
                $("#range_max").val(options[this.selected].range[1]);

                this.current_model.set("parameters", options);
                if(options[this.selected].hasOwnProperty("logarithmic"))
                    this.createScale(options[this.selected].logarithmic);
                else
                    this.createScale();

                Communicator.mediator.trigger("layer:parameters:changed", this.current_model.get("name"));
            },

            applyChanges: function(){

                var options = this.current_model.get("parameters");

                    //this.$("#coefficients_range_max").val(this.current_model.get("coefficients_range") [1]);

                var error = false;
                var model_change = false;

                // Check color ranges
                var range_min = parseFloat($("#range_min").val());
                error = error || this.checkValue(range_min,$("#range_min"));

                var range_max = parseFloat($("#range_max").val());
                error = error || this.checkValue(range_max,$("#range_max"));

                // Set parameters and redraw color scale
                if(!error){
                    options[this.selected].range = [range_min, range_max];

                    if(options[this.selected].hasOwnProperty("logarithmic"))
                        this.createScale(options[this.selected].logarithmic);
                    else
                        this.createScale();
                }

                // Check coefficient ranges
                if ($("#coefficients_range_min").length && $("#coefficients_range_max").length){
                    var coef_range_min = parseFloat($("#coefficients_range_min").val());
                    var coef_range_max = parseFloat($("#coefficients_range_max").val());

                    if(coef_range_min>coef_range_max && coef_range_max!==-1){
                        error = true;
                        $("#coefficients_range_min").addClass("text_error");
                        $("#coefficients_range_max").addClass("text_error");
                        $("#coefficients_range_min").parent()
                            .append('<div id="coefficient_error">Please make sure first value is lower than second</div>')
                    }else{
                        $("#coefficients_range_min").removeClass("text_error");
                        $("#coefficients_range_max").removeClass("text_error");
                        $("#coefficient_error").remove();
                    }
                
                    error = error || this.checkValue(coef_range_min,$("#coefficients_range_min"));
                    error = error || this.checkValue(coef_range_max,$("#coefficients_range_max"));

                    if(!error){
                        if(this.current_model.get("coefficients_range")[0]!=coef_range_min || 
                           this.current_model.get("coefficients_range")[1]!=coef_range_max){
                            model_change = true;
                        }
                        this.current_model.set("coefficients_range", [coef_range_min, coef_range_max]);
                    }
                }

                // Check for height attribute
                if ($("#heightvalue").length){
                    var height = parseFloat($("#heightvalue").val());
                    error = error || this.checkValue(height,$("#heightvalue"));

                    if (!error){
                        if(this.current_model.get("height")!=height){
                            model_change = true;
                        }
                        this.current_model.set("height", height);
                    }
                }
                
                var contextStorer = this;
                if ($('.composed_model_operation_operand').length) {
                  contextStorer.applyComposedModelChanges();
                    // composed model computation from other models
                    // check for the coefficient range of all choices elements
                    $('.composed_model_operation_operand').parent().each(function() {
                        // "this" is the current element in the loop
                        var holding_div = $(this).children(".degree_range_selection_input");
                        var coef_range_min_element = $(holding_div).children('.composed_model_operation_coefficient_min');
                        var coef_range_max_element = $(holding_div).children('.composed_model_operation_coefficient_max');
                        var coef_range_min = parseFloat(coef_range_min_element.val());
                        var coef_range_max = parseFloat(coef_range_max_element.val());

                        if (coef_range_min > coef_range_max && coef_range_max !== -1) {
                            error = true;
                            coef_range_min_element.addClass("text_error");
                            coef_range_max_element.addClass("text_error");
                        } else {
                            coef_range_min_element.removeClass("text_error");
                            coef_range_max_element.removeClass("text_error");
                        }

                        error = error || contextStorer.checkValue(coef_range_min, coef_range_min_element);
                        error = error || contextStorer.checkValue(coef_range_max, coef_range_max_element);
                    });
                    model_change = true;
                    //TODO: FIX: ADD CHECKING FOR MODEL CHANGE, THIS WAY COLORSCALE SETTING IS OVERWRITTEN
                }

                if(!error){
                    // Remove button only on normal models, in composed model window leave it there
                    if((this.current_model.get("name") !== 'Composed_Model')){
                      $("#applychanges").empty();
                    }

                    // If there were changes of the model parameters recalculate the color range
                    if(model_change){
                        var that = this;

                        var sel_time = Communicator.reqres.request('get:time');

                        if((this.current_model.get("name") === 'Composed_Model')){
                           var modelExpression = this.current_model.get("model_expression");
                          var payload = evalModelTmplComposed_POST({
                              'model_expression': modelExpression,
                              "variable": this.selected,
                              "begin_time": getISODateTimeString(sel_time.start),
                              "end_time": getISODateTimeString(sel_time.end),
                              "elevation": this.current_model.get("height"),
                              "height": 24,
                              "width": 24,
                              "getonlyrange": true
                          });

                          $.post(this.current_model.get("download").url, payload)
                              .success(this.handleRangeRespone.bind(this))
                              .fail(this.handleRangeResponseError);
                              
                        } else if(this.current_model.attributes.hasOwnProperty("shc") && 
                            this.current_model.get("differenceTo") === null){

                            var payload = evalModelTmpl_POST({
                                "model": "Custom_Model",
                                "variable": this.selected,
                                "begin_time": getISODateTimeString(sel_time.start),
                                "end_time": getISODateTimeString(sel_time.end),
                                "elevation": this.current_model.get("height"),
                                "coeff_min": this.current_model.get("coefficients_range")[0],
                                "coeff_max": this.current_model.get("coefficients_range")[1],
                                "shc": this.current_model.get('shc'),
                                "height": 24,
                                "width": 24,
                                "getonlyrange": true
                            });

                            $.post(this.current_model.get("download").url, payload)
                                .success(this.handleRangeRespone.bind(this))
                                .fail(this.handleRangeResponseError);

                        } else if(this.current_model.get("differenceTo") !== null){

                            var product = this.current_model;
                            var refProd = globals.products.filter(function(p){
                                return p.get('download').id === product.get('differenceTo');
                            });

                            var shc = defaultFor(refProd[0].get('shc'), product.get('shc'));

                            var payload = tmplEvalModelDiff({
                                'model': product.get("download").id,
                                'reference_model': refProd[0].get("download").id,
                                "variable": this.selected,
                                "begin_time": getISODateTimeString(sel_time.start),
                                "end_time": getISODateTimeString(sel_time.end),
                                "elevation": this.current_model.get("height"),
                                "coeff_min": this.current_model.get("coefficients_range")[0],
                                "coeff_max": this.current_model.get("coefficients_range")[1],
                                "shc": shc,
                                "height": 24,
                                "width": 24,
                                "getonlyrange": true
                            });

                            $.post(this.current_model.get("download").url, payload)
                                .success(this.handleRangeRespone.bind(this))
                                .fail(this.handleRangeResponseError);
                        } else {

                            var req = evalModelTmpl({
                                url: this.current_model.get("download").url,
                                model: this.current_model.get("download").id,
                                variable: this.selected,
                                begin_time: getISODateTimeString(sel_time.start),
                                end_time: getISODateTimeString(sel_time.end),
                                coeff_min: this.current_model.get("coefficients_range")[0],
                                coeff_max: this.current_model.get("coefficients_range")[1],
                                elevation: this.current_model.get("height")
                            });

                            $.get(req)
                                .success(this.handleRangeRespone.bind(this))
                                .fail(this.handleRangeResponseError);
                        }
                        

                    }else{
                        //Apply changes
                        this.current_model.set("parameters", options);
                        Communicator.mediator.trigger("layer:parameters:changed", this.current_model.get("name"));
                    }
                }
            },

            applyComposedModelChanges: function(){
                var modelsData = $('#composed_model_compute').data();
                var selected = _.filter(modelsData, function(model) {
                    return model.selectedComposed === true;
                });
                // save data to selected models manually for immutable properties
                var models = globals.products.filter(function (p) {
                    return p.get('model');
                });
                _.each(selected, function(selectedModel) {
                    var globalFound = models.find(function(model) {
                        return model.get('download').id == selectedModel.id;
                    });
                    globalFound.attributes.selectedComposed = selectedModel.selectedComposed;
                    globalFound.attributes.sign = selectedModel.sign;
                })
                
                // expression looks like +'Model1'(min_degree=3,max_degree=20)-'Model2'(min_degree=-1,max_degree=-1)
                var modelExpression = '';
                _.each(selected, function(selectedModel) {
                   modelExpression += (selectedModel.sign + '"' + selectedModel.id + '"(min_degree='+selectedModel.coefficients[0]+',max_degree='+selectedModel.coefficients[1]+')')
                 });
                 //save it to data holder
                 this.current_model.attributes.model_expression = modelExpression;
            },

            checkValue: function(value, textfield){
                if (isNaN(value)){
                    textfield.addClass("text_error");
                    return true;
                }else{
                    textfield.removeClass("text_error");
                    return false;
                }
            },

            setModel: function(model){
                this.model = model;
                /*this.model.on('change:parameters', function(model, data) {
                    
                }, this);*/
            },

            sameModel: function(model){
                return this.model.get("name") == model.get("name");
            },

            onUploadSelectionChanged: function(evt) {
                var that = this;
                var reader = new FileReader();
                var filename = evt.target.files[0].name;
                reader.onloadend = function(evt) {
                    that.current_model.set('shc', evt.target.result);
                    that.current_model.set('shc_name', filename);

                    var magnetic_model = globals.models.get(that.current_model.get('download').id);
                    if (magnetic_model) {
                      magnetic_model.set({
                        shc: evt.target.result,
                        shc_name: filename
                      });
                      magnetic_model.fetch();
                    }

                    // Save shc file to localstorage
                    localStorage.setItem('shcFile', JSON.stringify({
                        name: filename,
                        data: evt.target.result
                    }));

                    that.$("#shc").find("#filename").remove();
                    that.$("#shc").append('<p id="filename" style="font-size:.9em;">Selected File: '+filename+'</p>');


                    var sel_time = Communicator.reqres.request('get:time');

                    if(that.current_model.get("views")[0].id == "shc" && 
                        that.current_model.get("differenceTo") === null){

                        if(that.current_model.attributes.hasOwnProperty("shc")){

                            var payload = evalModelTmpl_POST({
                                "model": "Custom_Model",
                                "variable": that.selected,
                                "begin_time": getISODateTimeString(sel_time.start),
                                "end_time": getISODateTimeString(sel_time.end),
                                "elevation": that.current_model.get("height"),
                                "coeff_min": that.current_model.get("coefficients_range")[0],
                                "coeff_max": that.current_model.get("coefficients_range")[1],
                                "shc": that.current_model.get('shc'),
                                "height": 24,
                                "width": 24,
                                "getonlyrange": true
                            });

                            $.post(that.current_model.get("download").url, payload)
                                .success(that.handleRangeResponeSHC.bind(that, evt))
                                .fail(that.handleRangeResponseError)
                                .always(that.handleRangeChange.bind(that));
                        }

                    }else if(that.current_model.get("differenceTo") !== null){

                        var product = that.current_model;
                        var refProd = globals.products.filter(function(p){
                            return p.get('download').id === product.get('differenceTo');
                        });

                        var shc = defaultFor(refProd[0].get('shc'), product.get('shc'));

                        var payload = tmplEvalModelDiff({
                                'model': product.get("download").id,
                                'reference_model': refProd[0].get("download").id,
                                "variable": that.selected,
                                "begin_time": getISODateTimeString(sel_time.start),
                                "end_time": getISODateTimeString(sel_time.end),
                                "elevation": that.current_model.get("height"),
                                "coeff_min": that.current_model.get("coefficients_range")[0],
                                "coeff_max": that.current_model.get("coefficients_range")[1],
                                "shc": shc,
                                "height": 24,
                                "width": 24,
                                "getonlyrange": true
                            });

                            $.post(that.current_model.get("download").url, payload)
                                .success(that.handleRangeRespone.bind(that))
                                .fail(that.handleRangeResponseError);
                    }

                    /*var payload = evalModelTmpl_POST({
                        "model": "Custom_Model",
                        "variable": that.selected,
                        "begin_time": getISODateTimeString(sel_time.start),
                        "end_time": getISODateTimeString(sel_time.end),
                        "elevation": that.current_model.get("height"),
                        "coeff_min": that.current_model.get("coefficients_range")[0],
                        "coeff_max": that.current_model.get("coefficients_range")[1],
                        "shc": that.current_model.get('shc'),
                        "height": 24,
                        "width": 24,
                        "getonlyrange": true
                    });

                    $.post(that.current_model.get("download").url, payload)
                        .success(function(response){
                            var options = that.current_model.get("parameters");
                            var resp = response.split(',');
                            var range = [Number(resp[1]), Number(resp[2])];
                            // Make range "nicer", rounding depending on extent
                            range = d3.scale.linear().domain(range).nice().domain();
                            $("#range_min").val(range[0]);
                            $("#range_max").val(range[1]);
                            options[that.selected].range = range;
                            that.current_model.set("parameters", options);
                            that.createScale();
                            //Communicator.mediator.trigger("layer:parameters:changed", this.current_model.get("name"));
                            Communicator.mediator.trigger("file:shc:loaded", evt.target.result);

                            var params = { name: that.current_model.get("name"), isBaseLayer: false, visible: false };
                            Communicator.mediator.trigger('map:layer:change', params);
                            Communicator.mediator.trigger("layer:activate", that.current_model.get("views")[0].id);
                        })
                        .fail(that.handleRangeResponseError);
                        //.always(that.handleRangeChange.bind(that));*/

                    


                }

                reader.readAsText(evt.target.files[0]);
            },

            addLogOption: function(options){
                var that = this;
                if(options[this.selected].hasOwnProperty("logarithmic")){
                    var checked = "";
                    if (options[this.selected].logarithmic)
                        checked = "checked";

                    this.$("#logarithmic").empty();

                    this.$("#logarithmic").append(
                        '<form style="vertical-align: middle;">'+
                        '<label class="valign" for="outlines" style="width: 100px;">Log. Scale</label>'+
                        '<input class="valign" style="margin-top: -5px;" type="checkbox" name="logarithmic" value="logarithmic" ' + checked + '></input>'+
                        '</form>'
                    );

                    this.$("#logarithmic input").change(function(evt){
                        var options = that.current_model.get("parameters");
                        options[that.selected].logarithmic = !options[that.selected].logarithmic;
                        
                        that.current_model.set("parameters", options);
                        Communicator.mediator.trigger("layer:parameters:changed", that.current_model.get("name"));

                        if(options[that.selected].hasOwnProperty("logarithmic"))
                            that.createScale(options[that.selected].logarithmic);
                        else
                            that.createScale();
                    });
                }
            },

            createScale: function(logscale){

                var superscript = "⁰¹²³⁴⁵⁶⁷⁸⁹",
                formatPower = function(d) { 
                    if (d>=0)
                        return (d + "").split("").map(function(c) { return superscript[c]; }).join("");
                    else if (d<0)
                        return "⁻"+(d + "").split("").map(function(c) { return superscript[c]; }).join("");
                };

                $("#setting_colorscale").empty();
                var margin = 20;
                var width = $("#setting_colorscale").width();
                var scalewidth =  width - margin *2;

                var range_min = this.current_model.get("parameters")[this.selected].range[0];
                var range_max = this.current_model.get("parameters")[this.selected].range[1];
                var uom = this.current_model.get("parameters")[this.selected].uom;
                var style = this.current_model.get("parameters")[this.selected].colorscale;

                $("#setting_colorscale").append(
                    '<div id="gradient" style="width:'+scalewidth+'px;margin-left:'+margin+'px"></div>'
                );
                /*'<div class="'+style+'" style="width:'+scalewidth+'px; height:20px; margin-left:'+margin+'px"></div>'*/

                this.plot.setColorScale(style);
                var base64_string = this.plot.colorScaleImage.toDataURL();
                $('#gradient').css('background-image', 'url(' + base64_string + ')');


                var svgContainer = d3.select("#setting_colorscale").append("svg")
                    .attr("width", width)
                    .attr("height", 40);

                var axisScale;
                
                if(logscale){
                    axisScale = d3.scale.log();
                }else{
                    axisScale = d3.scale.linear();
                }

                axisScale.domain([range_min, range_max]);
                axisScale.range([0, scalewidth]);

                var xAxis = d3.svg.axis()
                    .scale(axisScale);

                if(logscale){
                    var numberFormat = d3.format(",f");
                    function logFormat(d) {
                        var x = Math.log(d) / Math.log(10) + 1e-6;
                        return Math.abs(x - Math.floor(x)) < .3 ? numberFormat(d) : "";
                    }
                    xAxis.tickFormat(logFormat);

                }else{
                    var step = Number(((range_max - range_min)/5).toPrecision(3));
                    var ticks = d3.range(range_min,range_max+step, step);
                    xAxis.tickValues(ticks);
                    xAxis.tickFormat(d3.format("g"));
                }

                var g = svgContainer.append("g")
                    .attr("class", "x axis")
                    .attr("transform", "translate(" + [margin, 3]+")")
                    .call(xAxis);

                if(uom){
                    g.append("text")
                        .style("text-anchor", "middle")
                        .style("font-size", "1.1em")
                        .attr("transform", "translate(" + [scalewidth/2, 35]+")")
                        .text(uom);
                }

                svgContainer.selectAll(".tick").select("line")
                    .attr("stroke", "black");
            },

            createHeightTextbox: function(height){
                var that = this;
                this.$("#height").empty();
                if( (height || height==0) && this.selected != "Fieldlines"){
                    this.$("#height").append(
                        '<form style="vertical-align: middle;">'+
                        '<label for="heightvalue" style="width: 120px;">Height</label>'+
                        '<input id="heightvalue" type="text" style="width:30px; margin-left:8px"/>'+
                        '</form>'
                    );
                    this.$("#heightvalue").val(height);
                    this.$("#height").append(
                        '<p style="font-size:0.85em; margin-left: 120px;">Above ellipsoid (Km)</p>'
                    );

                    // Register necessary key events
                    this.registerKeyEvents(this.$("#heightvalue"));
                }
            }

        });

        return {"LayerSettings": LayerSettings};

    });

}).call( this );
