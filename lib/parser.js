/**
 * Main functionality file of akf-html2json
 * reads a file in function parseFile, searches each line for category headlines,
 * if there is a category found, call the related parserFunctionality in class CdHtmlParser.
 * Skip the lines which belong to category and then search for the next in file.
 * 
 * Also contains some functionalities which trigger the line segment analyzer.  
 */

//Dependencies to external libraries
var cheerio                 = require('cheerio'); 
var cheeriotableparser      = require('cheerio-tableparser');
var fs                      = require('fs');
//Dependencies to own libraries
var dictionaryHandler       = require('./dictionaryHandler'); 
var cfw                     = require('./checkfileWriter');
var parser_persons          = require('./parser_persons');
var parser_tables           = require('./parser_tables');
var parser_organbezuege     = require('./parser_organbezuege');
var parser_aktionaer        = require('./parser_aktionaer_eigner_beteiligungen');
var parser_additions        = require('./parser_additions');
var parser_boersenbewertung = require('./parser_boersenbewertung.js');
var utils                   = require('./utils');
var regLib                  = require('./regexLib');
var lineSegmentAnalyzer     = require('./lineSegmentAnalyzer');
var callCounter             = require('./callCounter');


var _lastidx_               = 0; //The last recognized index, is written to by _checkinfo function


//Load dictionaries for parsing 
dictionaryHandler.createTitlesDict();
dictionaryHandler.createFunctionsDict();


/**
 * Additional functionality for arrays,
 * calls trim() for each element in an array
 */
Array.prototype.trimAll = function() {
    this.forEach((v,idx) => this[idx] = v.trim());
    return this;
}

/**
 * Split the string at first occurence of the seperator
 * @param {string} sep separator
 */
String.prototype.splitAtFirst = function(sep) {
    const idx = this.indexOf(sep);
    return [this.substr(0, idx), this.substr(idx+sep.length)];
}

/**
 * **Obsolete**
 * Categorizes a string with person name to title, firstname and lastname
 * is made with regex, the latest functionality in parser_persons.js uses 
 * dictionaries. 
 * @param {string} raw text which contains the information about person 
 */
function _parsePersonName(raw) {
    var ret = {}
    raw.trim().replace(/^((?:(?:[A-Z]{2,} )?[A-ZÖÄÜ][a-zA-Zöäü\.-]+)?\s)?(.*?)\s([A-Za-zöäü]+)$/,
        (_, title, firstName, lastName) => {
            ret = {title, firstName, lastName}
        })
    ret.full = raw
    return ret
}

/**
 * Log down the called parser category to a checkfile, named Checkfile_Index.txt
 * Also log the starting index which the category occured, also the endindex, where the end was
 * recognized
 * @param {string} matchtheme category name of the called functino 
 * @param {integer} originline the original line where the function was called from 
 * @param {integer} i starting index, reading started from here 
 * @param {array} lines the set of recognized lines for that category
 */
function _checkInfo(matchtheme,originline, i, lines){
    if (matchtheme == 'AKF_PARSER_START') _lastidx_ = 0;
    var info = JSON.stringify( {Match:matchtheme,Startindex:originline,Endindex:i, Diffindex:originline - _lastidx_}, null, " ");
    cfw.writeToCheckfile(originline,info,JSON.stringify(lines[i], null, " "),
                    cfw.config.checkfile_index ,cfw.config.checkfile_index_enabled);
    _lastidx_ = i
    return 0
}

 
module.exports = class CdHtmlParser {

    constructor() {
        this.exportVocabulary = false

        this._parseFunctions = [
            {
                /**
                 * Matching some content at file start, it's a tag which is inserted 
                 * in the html by this software two lines after the 'head'-tag. It finds the
                 * following information and puts it in json object 'all_wkn_entry'
                 * type: Aktientyp 
                 * isin, 
                 * wkn, 
                 * nw: nennwert 
                 */
                match: 'AKF_PARSER_START',
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_name);
                    i = i+1;
                    var originline = i;
                    var origintext = [];
                    var type = "",isin = "",wkn = "",nw = "";
                    var wkn_entry = {}; 
                    var all_wkn_entry = [];
                    var entry_idx = 0;
                    var regExpBrackets = /\(([^)]+)\)/;
            
                    do{
                        origintext.push(lines[i]+"\r\n")
                        //Find company name
                        if (lines[i] && (lines[i].match('<td align=center>')|| lines[i].match('<td align="center">'))){
                            var firma = /<b>(.*?)<\/b>/g.exec(lines[i])[1];
                            ret.name =  firma;
                            cfw.writeToCheckfile(originline,JSON.stringify(origintext, null, " "),JSON.stringify(firma, null, " "), cfw.config.checkfile_name ,cfw.config.checkfile_name_enabled);
                            origintext = null;
                            origintext = [];
                        }
                        //Find wkn
                        if (lines[i] && (lines[i].match('Wertpapier-Kenn')||lines[i].match('Wertpapier Kenn.-Nr.'))) {
                             //Control if new entry starts
                            if (entry_idx > 0){
                                all_wkn_entry.push({type, isin, wkn, nw})
                                type= null, isin= null, wkn= null, nw= null;
                                type= "", isin= "", wkn= "", nw= "";
                            }
                            wkn = lines[i].match(/\d+/g)[0];
                            //Find kind of type e.g. ("Inhaber-Stammaktie")
                            type = lines[i].match(/\(([^)]+)\)/);
                            if (type == null){
                                var startidx = i
                                do{
                                    i = i+1;
                                    origintext.push(lines[i]+"\r\n");
                                    if(!lines[i] && i >= lines.length){
                                        debugger;
                                    }
                                    type = lines[i].match(/\(([^)]+)\)/);
                                }while (!(lines[i].match('</center>')))
                                if (type == null){
                                    type = ""
                                    i = startidx
                                }
                            }
                            if (type != null)
                                type = type[1]
                             entry_idx = 1 
                        }
                        //Find isin
                        if (lines[i] && lines[i].match('ISIN:')){
                            //Control if new entry starts
                            if (entry_idx > 1){
                                all_wkn_entry.push({type, isin, wkn, nw})
                                type= null, isin= null, wkn= null, nw= null;
                                type= "", isin= "", wkn= "", nw= "";
                            }
                            lines[i].replace(/\d+$/, (_) => { 
                                isin = parseInt(_) 
                            })
                            isin = lines[i].match(/[^>]+$/)[0];
                            //Control if new entry starts
                            if (entry_idx == 1 && String(isin).match(String(wkn)) == null  && String(isin).match("DE") != null){
                                var empty = isin
                                isin = null, isin = ""
                                all_wkn_entry.push({type, isin, wkn, nw})
                                type= null, wkn= null, nw= null, isin = empty;
                                type= "", wkn= "", nw= "", empty = null;
                            }
                            //Find kind of type e.g. ("Inhaber-Stammaktie")
                            if (type == null || type == ""){
                                type = lines[i].match(/\(([^)]+)\)/);
                            }
                            if (type == null){
                                do{
                                    i = i+1;
                                    origintext.push(lines[i]+"\r\n")
                                    type = lines[i].match(/\(([^)]+)\)/);
                                }while (!(lines[i].match('</center>')))
                            }
                            if (type != null && typeof type != "string"){
                                type = type[1]
                            }
                            //i = i+1
                            entry_idx = 2
                        }
                        //Find nw
                        if (lines[i] && lines[i].match('Nennwert:')){
                            nw = lines[i].replace("<center><b><b>Nennwert: </b>","")
                            entry_idx =3
                        }
                        i++

                        var end1=true;
                        var end2=true;
                        if(lines[i]){
                            var sitzmatch = lines[i].match('<b>Sitz</b>');
                            if(sitzmatch!=null){
                                end1=false;
                            }
                            var tätmatch = lines[i].match('b>Tätigkeitsgebiet');
                            if(tätmatch!=null){
                                end2=false;
                            }
                        }

                    } while (end1 && end2)
                    all_wkn_entry.push({type, isin, wkn, nw});
                    cfw.writeToCheckfile(originline,JSON.stringify(origintext, null, " "),JSON.stringify(all_wkn_entry, null, " "), cfw.config.checkfile_wknentry ,cfw.config.checkfile_wknentry_enabled);
                    i -= 1;
                    ret.all_wkn_entry = all_wkn_entry; 
                    _checkInfo('AKF_PARSER_START',originline, i, lines);
                    return i;
                }
            },
            {
               /**
                * Match entry of 'Sitz', which contains entries for:
                * Postbox, Telefon, email,fax, website, and T-Online-id                                 if (k.match('Telefon')) objTemp.phone = v
                */
                match: '<b>Sitz</b>',
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_sitz);
                    var originline = i; 
                    try{
                        i += 1
                        var addressLines = '';
                        var objTemp = {};
                        var retTemp = []; 
                        var addressLinearr = [];
                        //Read all Linies and seperate entryblocks
                        do {
                            if (!(lines[i].match('<!-- weitere Sitze -->'))){
                                if (!(lines[i].match('<br><center><h5><table><tr>'))){
                                    addressLines += lines[i];
                                }
                            }
                            if (lines[i].match('<br>')){
                                if (!(lines[i].match('<br><center>'))){
                                    if (lines[i].match('<br>').index == 0){
                                        addressLinearr.push(addressLines);
                                        addressLines = null;
                                        addressLines = "";
                                    }
                                }
                            }
                            i = i+1;
                        } while (!(lines[i].match('<br><center><h5><table><tr>|</body>')))
                        addressLinearr.push(addressLines);
                        addressLines = null;
                        if(addressLinearr.length>0){
                            //Replace HTML-Tags in adressLinearr
                            objTemp.origpost = [].concat(addressLinearr).join().replace(/(<([^>]+)>)/ig," ");
                        }
                        //Read every entryblock
                        for (var idx = 0; idx < addressLinearr.length; idx++){
                            addressLines = addressLinearr[idx]
                            const addressName = addressLines.split('</b><br>').trimAll()
                            var type = "Sitz"
                            objTemp.type = type
                            //Check if a type of the entry is given e.g. ("Verwaltungssitz")
                            if (addressName.length > 1){
                                addressLines = addressName[1]
                                objTemp.type = addressName[0].replace("<b>", "")
                            }
                            var addressParts = addressLines.split('<br>').trimAll()
                            const origaddressParts = addressLines.split('<br>').trimAll()
                            var length = addressParts.length
                            var SecaddressParts = []
                            for (var idxx = 0; idxx < length; idxx++){
                                 //Check if "Großkunde-PLZ" (large customer) entry is given
                                if (addressParts[idxx].match("PLZ")){
                                    // TODO: CHECK PRBLY ERROR?
                                    objTemp.lcustomerzip = addressParts[idxx].split(/\s+/)[1];
                                    objTemp.lcustomercity = addressParts[idxx].split(/\s+/).splice(2,addressParts[idxx].split(' ').length);
                                    if (objTemp.lcustomercity.length>1){
                                        objTemp.lcustomercity = objTemp.lcustomercity.join(' ');
                                    }else{
                                        objTemp.lcustomercity = objTemp.lcustomercity[0];
                                    }
                                    addressParts = addressParts.slice(idxx+1, length);
                                    break;
                                }
                            }
                            var filteredaPs = addressParts.filter(Boolean);
                            //Check if there are extra text in front the entry e.g. ("Siemens Headquarters")
                            if (addressParts.filter(Boolean)[0].match(',') == null && addressParts.filter(Boolean)[0].match("[(]")==null){
                                objTemp.city = addressParts.filter(Boolean)[0]
                                if (addressParts.filter(Boolean).length > 1){
                                    filteredaPs = addressParts.filter(Boolean)
                                    filteredaPs.shift()                                
                                } else {filteredaPs == []}
                            }
                            const SecaddressPart = filteredaPs.filter(Boolean)
                            //Check if the first entry part is "Postfach"-information
                            if (SecaddressPart[0].match("Postfach|P.O.Box") == null){
                                //Check if the firs entry has comma seperator if not its only a City name given
                                if (filteredaPs.shift().match(',') != null){
                                    //Check if there is "5, Street" than erease the comma -> "5 Street"
                                    if (SecaddressPart[0].replace(/\d+/g, '').split()[0][0]== ","){
                                        const inputarr = SecaddressPart[0].replace(',', '')
                                        var what = inputarr.split(',')
                                        var street_with_number = inputarr.split(',')[0]
                                        var city_with_zip = inputarr.split(',')[1]
                                    }else{
                                        var [street_with_number, city_with_zip] = SecaddressPart.shift().split(',').trimAll()
                                    }
                                    //Check if the street has also number given!
                                    if (street_with_number.split(/\s+/).length != 1){
                                        //Check the streetnumber is in front or in the back of the string
                                        if (/^\d+$/.test(street_with_number[0])== true){
                                            objTemp.street_number = street_with_number.split(/\s+/)[0];
                                            objTemp.street = street_with_number.split(/\s+/).splice(1,street_with_number.split(/\s+/).length).join(" ");
                                        }else{
                                            objTemp.street = street_with_number.split(/\s+/).splice(0, street_with_number.split(/\s+/).length-1);
                                            if (objTemp.street.length>1)
                                                objTemp.street = objTemp.street.join(' ')
                                            else{objTemp.street = objTemp.street[0]}
                                            objTemp.street_number = street_with_number.split(/\s+/)[street_with_number.split(/\s+/).length-1];
                                        }
                                    }else{objTemp.street = street_with_number, objTemp.street_number = ""}
                                    objTemp.zip = city_with_zip.trimLeft().split(/\s+/)[0];
                                    objTemp.city = city_with_zip.trimLeft().split(/\s+/).splice(1,city_with_zip.split(/\s+/).length);
                                    if (objTemp.city.length>1)
                                        objTemp.city = objTemp.city.join(' ')
                                    else{objTemp.city = objTemp.city[0]}
                                } else {
                                    objTemp.city  = SecaddressPart[0]
                                }
                            }
                            for (let addressPart of SecaddressPart) {
                                //Check if the second entry is "Postfach"-information
                                if (addressPart.match('Postfach|Postanschrift|P.O.Box')) {
                                    const[k,v] = addressPart.splitAtFirst(',')
                                    if (k.trimLeft().split(/\s+/).length > 1){
                                        objTemp.POBox = k.trimLeft().split(/\s+/).splice(1,k.split(/\s+/).length-1).join(" ");
                                    }else{
                                        var POBox = k 
                                    }
                                    if (v.trimLeft().split(/\s+/).length > 1){
                                        objTemp.zipPOBox = v.trimLeft().split(/\s+/)[0];
                                        objTemp.cityPOBox =  v.trimLeft().split(/\s+/).splice(1,k.split(/\s+/).length-1).join(" ");
                                    }else{
                                        objTemp.cityPOBox = v; objTemp.zipPOBox ="";
                                    }
                                }
                                else{
                                    //Reads the other Information
                                    const [k, v] = addressPart.splitAtFirst(':');
                                    if (!k) continue
                                    if (k.match('Telefon')) objTemp.phone = v;
                                    else if (k.match('Telefax')) objTemp.fax = v;
                                    else if (k.match(/e.mail/))objTemp.email = v.split(/\s*,\s*/);
                                    else if (k.match('Internetseite|http'))objTemp.www = v.split(/\s*,\s*/);
                                    else if (k.match('T-Online')) objTemp.tonline = v.split(/\s*,\s*/);
                                    else console.error(`Unkwn addressPart ${k}=${v}`);
                                }
                            }
                            retTemp.push(objTemp);
                            objTemp = null;
                            objTemp = {};
                        }
                        cfw.writeToCheckfile(originline,JSON.stringify(addressLinearr, null, " "),
                            JSON.stringify(retTemp, null, " "), 
                            cfw.config.checkfile_sitz ,cfw.config.checkfile_sitz_enabled);  

                        i -= 1;
                        ret.Sitz = retTemp;
                        _checkInfo('Sitz',originline, i, lines);
                        return i;
                    }catch(ex){
                        console.log(" exception during match  ",ex);
                    }
                },
            },
            {
                /**
                 * Match entries for Tätigkeitsgebiet/Gründung into 'activity_description'
                 */
                match: 'Tätigkeitsgebiet/Gründung',
                disabled: false,
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_taetigkeitsgebiet);
                    var originline = i;
                    i += 1;
                    var activity_description = '';
                    do {                         
                        var end1 = !(lines[i].match('<br><center>'));
                        var end2 = !(lines[i].match('<b>Gr'));
                        if(end1&&end2){
                            activity_description += lines[i++];                             
                        }                              
                    }while (end1 && end2)

                    if (activity_description.replace(/<br>/g, '\n').match('<b>Gr')){
                        return i-2;
                    }
                    ret.activity_description = activity_description.replace(/<br>/g, '\n');
                    
                    cfw.writeToCheckfile(originline,JSON.stringify(activity_description, null, " "),
                         JSON.stringify(ret.activity_description, null, " "),
                         cfw.config.checkfile_taetigkeitsgebiet ,
                         cfw.config.checkfile_taetigkeitsgebiet_enabled);  
                         
                         
                    i -= 1;
                    _checkInfo('Tätigkeitsgebiet/Gründung',originline, i, lines);
                    return i;
                }
            },
            {
                /**
                 * Match category of 'Gründung' into established_year
                 */
                match: '<br><b>Gründung|<b>Gründung:',
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_gruendung);
                    var originline = i;
                    
                  
                    lines[i].replace(/\d+/, (_) => 
                        ret.established_year = parseInt(_)
                    );

                    var lineReduced = lines[i].replace(/<b>Gründung:\s*<\/b>/,"");
                    var restLines = lineReduced.split('<br>');
                    var restLinesFinal =[];
                    for(var x=0;x<restLines.length;x++){
                        var currentline = utils.htmlText2Text(restLines[x]).trim();
                        if(currentline) restLinesFinal.push(currentline);
                    }
                    
                    ret.established_year_bemerkungen = restLinesFinal;


                    cfw.writeToCheckfile(originline,JSON.stringify(lines[i], null, " "),
                        JSON.stringify(ret.established_year, null, " "), 
                        cfw.config.checkfile_gruendung ,cfw.config.checkfile_gruendung_enabled);  
                    
                    var stringifiedBemerkungen = JSON.stringify(ret.established_year_bemerkungen, null, " ");
                     
                    cfw.writeToCheckfile(originline,"Additional entry for bemerkungen:",
                        stringifiedBemerkungen, 
                        cfw.config.checkfile_gruendung ,cfw.config.checkfile_gruendung_enabled); 

                    i += 1;
                    _checkInfo('Gründung', originline, i, lines);
                    return i;
                }
            },
            {
                /**
                 * Match category of 'Status' into status
                 */
                match: '<b>Status:',
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_status);

                    var originline = i;
                    lines[i].replace(/[^>]+$/, (_) => ret.status = _);
                    
                    cfw.writeToCheckfile(originline,JSON.stringify(lines[i], null, " "),
                        JSON.stringify(ret.status, null, " "), cfw.config.checkfile_status ,
                        cfw.config.checkfile_status_enabled);                  

                    _checkInfo('Status',originline, i, lines);
                    return i;
                }
            },
            {  
                /**
                * Match category of 'Sonstige Angaben' into sonstigeAngaben
                */
                match: '<b>Sonstige Angaben</b>',
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_angaben);

                    var originline = i;
                    var origintext = "";
                    i += 1;
                    var angabentemp = [];
                    do {
                        origintext += lines[i];
                        if (lines[i].match('<b>') != null){
                            //Replace HTML-Tags 
                            var regexpattern = /(<([^>]+)>)/ig;
                            var strip_str = lines[i].replace(regexpattern, "");
                            angabentemp.push(strip_str.split(":"));
                        }
                        i += 1
                    }while (!(lines[i].match('</body>|</html>')));

                    cfw.writeToCheckfile(originline,JSON.stringify(origintext, null, " "),
                        JSON.stringify(angabentemp, null, " "), cfw.config.checkfile_angaben ,
                        cfw.config.checkfile_angaben_enabled);           

                    _checkInfo('Sonstige Angaben',originline, i, lines);
                    ret.sonstigeAngaben = angabentemp;
                    return i;
                }
            },
            
            {
                /**
                 * **Obsolete** Beschäftigte is already recognized in kennzahlen
                 * Match 'Beschäftigte' into employee_stats
                 */
                match: '>Beschäftigte',
                disabled: true,  //disabled, because it's obsolete
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_beschaeftigte);

                    var originline = i;
                    var employee_stats = [];
                    const ucStyle = lines[i].match('LEFT');
                    var orig_text = lines[i];
                    //Until table end appears...
                    while (!(lines[i++].match('</table>'))) {
                        orig_text += lines[i];
                        if (!(lines[i].match('<td'))) continue
                        //Replace html in line
                        const stat = lines[i].replace(/<[^>]+>/g, '').trim();
                        if (ucStyle) {
                            //Spare out lines with html tags
                            if (lines[i].match('width') || lines[i].match('LEFT')) continue
                            employee_stats.push(stat);
                        } else {
                            employee_stats.push(stat);
                        }
                    }
                    ret.employee_stats = employee_stats;
                    
                    cfw.writeToCheckfile(originline,JSON.stringify(orig_text, null, " "),
                        JSON.stringify(employee_stats, null, " "),
                         cfw.config.checkfile_beschaeftigte ,cfw.config.checkfile_beschaeftigte_enabled);                                                                
                    
                    _checkInfo('Beschäftigte',originline, i, lines);
                    return i;
                }
            },
            {   /**
                 * THIS IS LEGACY CODE, see Aufsichtsrat parsing function below  
                 */ 
                match: 'b>Aufsichtsrat:</b><br>',
                disabled: true, //disabled true, cause legacy
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_aufsichtsrat);

                    var originline = i; 
                    i += 1;
                    var aufsichtsrat = '';
                    
                    do { 
                        var linetoAdd = lines[i++].replace('<br>', '') ;
                        linetoAdd = regLib.replaceSemicolonAndCommaInBrackets(linetoAdd);  
                        aufsichtsrat = aufsichtsrat+linetoAdd;          
                    }while (!(lines[i].match('<b>')))

                    ret.aufsichtsrat = [];
                    aufsichtsrat.split(/\s*;\s*/).trimAll().forEach(_ => {                                                       
                        var manager = parser_persons.checkPersonLine(_,originline);
                        cfw.writeToCheckfile(originline,_,JSON.stringify(manager), 
                            cfw.config.checkfile_aufsichtsrat,
                            cfw.config.checkfile_aufsichtsrat_enabled);         

                        ret.aufsichtsrat.push(manager);
                    });
                    i -= 1;
                    _checkInfo('Aufsichtsrat',originline, i, lines);
                    return i;
                }
            },           
            {
                /**
                * Match category of 'Aufsichtsrat' into aufsichtsrat
                */
                match: 'b>Aufsichtsrat: </b><br>|b>Aufsichtsrat:</b><br>',
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_aufsichtsrat);

                    var commonfunct_isThere = false; 
                    var commonfunct=''; 

                    var originline = i;                 
                    //Filter headlines
                    var aufsichtsrat = lines[i].replace(/b>Aufsichtsrat: <\/b><br>/i,'');
                    aufsichtsrat = aufsichtsrat.replace(/b>Aufsichtsrat:<\/b><br>/i,'');
                    
                    //Replace html-tag rests
                    aufsichtsrat = aufsichtsrat.replace(/<br>|<|>/gi,'');       
                    cfw.writeHeaderToCheckFile(aufsichtsrat, cfw.config.checkfile_akf_learndata, cfw.config.checkfile_akf_learndata_enabled)
   
                    i += 1;

                    do { 
                        //Sometimes a common title with abbreviation is there, line looks like:"*) Arbeitnehmervertreter<br>"                        
                        
                        //var linetowrite = lines[i++].replace('<br>', '')+"\n"
                        // cfw.writeHeaderToCheckFile(linetowrite, cfw.config.checkfile_akf_learndata, cfw.config.checkfile_akf_learndata_enabled)
                        
                        if(lines[i].match(/^\*\)/)){                       
                            var recline = lines[i];
                            commonfunct = recline.replace('*)','').replace('<br>','').trim();
                            commonfunct_isThere = true; 
                        }else if(lines[i].match(/\*\) Arbeitnehmervertreter/)){
                            lines[i] = lines[i].replace(/\*\) Arbeitnehmervertreter/,"")
                            lines[i] = lines[i].replace("<br>","").trim(); 
                            lines[i] = regLib.removeLastCharacter(lines[i],";");

                            commonfunct = "Arbeitnehmervertreter";
                            commonfunct_isThere = true; 
                        }
                        
                        aufsichtsrat += lines[i++].replace('<br>', '');  

                    }while (!lines[i]||!(lines[i].match('<b>')))
                    

                    console.log(aufsichtsrat)
                    //cfw.writeHeaderToCheckFile("Aufsichtsrat:", cfw.config.checkfile_akf_learndata, cfw.config.checkfile_akf_learndata_enabled)
                    
                    ret.aufsichtsrat = [];

                    aufsichtsrat.split(/\s*;\s*/).trimAll().forEach(_ => {                                                       
                        
                        cfw.writeHeaderToCheckFile(_, cfw.config.checkfile_akf_learndata, cfw.config.checkfile_akf_learndata_enabled)
                        
                        var manager = parser_persons.checkPersonLine(_,originline,commonfunct_isThere,commonfunct);
                        
                        cfw.writeToCheckfile(originline,_,JSON.stringify(manager),
                             cfw.config.checkfile_aufsichtsrat ,cfw.config.checkfile_aufsichtsrat_enabled);                                        
                        
                        
                        ret.aufsichtsrat.push(manager);
                    });
                    cfw.writeHeaderToCheckFile("Gründung: 9999", cfw.config.checkfile_akf_learndata, cfw.config.checkfile_akf_learndata_enabled)
                    
                    i -= 1;

                    _checkInfo('Aufsichtsrat',originline, i, lines)
                    return i;
                }
            },
            {
               /**
                * Match category of 'Vorstand' into vorstand
                */
                match: 'b>Vorstand:</b><br>',
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_vorstand);
                  
                    var originline = i;                 
                    i += 1;
                    var vorstand = '';

                    //Replace linebreaks
                    do { 
                        vorstand += lines[i++].replace('<br>', '');  
                    }while (!(lines[i].match('<b>')))  

                    if(!ret.vorstand)ret.vorstand = [];
                    //Replace semicolon and comma, if they are in parenthesis, because otherwise parsing errors
                    vorstand = regLib.replaceSemicolonAndCommaInBrackets(vorstand); 
                    //Parse the string
                    var vorstaende = parser_persons.parseVorstand(vorstand,originline,i,ret);
                    ret.vorstand.push(vorstaende);
                    _checkInfo('Vorstand',originline, i, lines)
                    return i-1; 
                }
            }, 
            {  /**
                * Match category of 'Vorstand' into vorstand,
                * note the space in the match string, parsing is here slightly different
                */
                match: 'b>Vorstand: </b><br>',
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_vorstand);
                   
                    var originline = i;       
                    var lineBRsplit = lines[i].split('<br>');
                    if(lineBRsplit.length <1) throw "Exception in lineBRsplit";
                    //Cut out first line, because it contains headline
                    var lineBRsplice = lineBRsplit.splice(1);    
                    i += 1;
                    var vorstand = '';
                    for(var x=0;x<lineBRsplice.length; x++){
                       vorstand+=lineBRsplice[x]; 
                    }       
                    if(!ret.vorstand)ret.vorstand = [];
                    var vorstaende = parser_persons.parseVorstand(vorstand,originline,i,ret);
                    ret.vorstand.push(vorstaende);
                    _checkInfo('Vorstand-2',originline, i, lines);
                    return i;                 
                }
            },
            {
               /**
                *  Match category of 'Leitung Kommunikation' into leitung_kommunikation 
                */
                match: '>Leitung Kommunikation',
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_leitung_kommunikation);
                    var headline = lines[i]; 
                    
                    var originline = i;      
                    i=i+1; //Start of with one line further
                    var currentline = lines[i];
                    

                    var linesLeitung =[]; //Lines related Leitung and Kommunikation
                    do{
                        if(currentline && currentline.trim()!=""){
                            linesLeitung.push(currentline);
                        }
                        i++;
                        currentline = lines[i];
                
                        var end = currentline.indexOf("<br><center>");               
                    }while(end==-1) 
                    //Parse Leiter 
                    var returnLeiter = parser_persons.parse_leiter(linesLeitung);
                    //Report to checkfile
                    cfw.writeToCheckfile(originline,JSON.stringify(linesLeitung, null, " "),
                        JSON.stringify(returnLeiter, null, " "),
                        cfw.config.checkfile_leitung_kommunikation,
                        cfw.config.checkfile_leitung_kommunikation_enabled);
                    //Assign to end object
                    ret.leitung_kommunikation = returnLeiter;
                    return i-1;
                }
            },
            {
               /**
                *  Match category of 'Geschäftsleitung' into geschleitung 
                */
                match: 'b>Geschäftsleitung:</b><br>|b>Geschäftsleitung: </b><br>',
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_geschleitung);

                    var originline = i;       
                    var lineBRsplit = lines[i].split('<br>');
                    if(lineBRsplit.length <1) throw "Exception in lineBRsplit";
                    var lineBRsplice = lineBRsplit.splice(1);    
                    var geschleitung = '';
                    for(var x=0;x<lineBRsplice.length; x++){
                       geschleitung+=lineBRsplice[x]; 
                    }
                    i += 1;
                    if(geschleitung===''){
                        //The result must be in the next line line 
                        geschleitung=lines[i].replace('<br>','');
                    }       
                    ret.geschleitung = [];
                    geschleitung = regLib.replaceSemicolonAndCommaInBrackets(geschleitung);
                    //Split at whitespace with semicolon
                    geschleitung.split(/\s*;\s*/).trimAll().forEach(_ => {                                                       
                        //Parse each line
                        var manager = parser_persons.checkPersonLine(_,originline,false,""); //JS: HINT ADD COMMON FUNCTION IF NECESSARY 
                        //Report 
                        cfw.writeToCheckfile(originline,_,JSON.stringify(manager), 
                            cfw.config.checkfile_geschleitung ,
                            cfw.config.checkfile_geschleitung_enabled);                                        
                        //Push to returnArray
                        ret.geschleitung.push(manager);
                    });
                    i-=1;
                    _checkInfo('Geschäftsleitung',originline, i, lines);
                    return i;
                }
            },
            {
                /** 
                 * Match category of 'Organbezüge' into organbezuege 
                 * 
                 * Remark: some lines are parsed directly in 'bemerkung' when there is no valid currency
                 * origin: Vorstand 1996: keine Angaben gem. § 286 Abs. 4 HGB 
                 * parsed {"jahr":"1996","bemerkung":"Vorstand 1996: keine Angaben gem. § 286 Abs. 4 HGB"}
                 */
                match: 'b>Organbezüge:</b>|b>Organbezüge :</b>|b>Organbezüge: </b>|b>OrganbezÃ¼ge:Â </b>',
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_organbezuege);

                    var originline = i;      
                    var lineBRsplit = lines[i].split('</b>');                       

                    if(lineBRsplit.length <1) throw "Exception in lineBRsplit";
                    
                    var lineBRsplice = lineBRsplit.splice(1);    
                    var organbezuege = '';
                    //Replace the html-tags
                    for(var x=0;x<lineBRsplice.length; x++){
                       organbezuege+=lineBRsplice[x].replace(/<br>/g,''); 
                    }
                    //Write headline with original data to checkfile 
                    cfw.writeHeaderToCheckFile(organbezuege,
                        cfw.config.checkfile_organbezuege,
                        cfw.config.checkfile_organbezuege_enabled);
                    
                    i += 1;
                    _checkInfo('Organbezüge',originline, i, lines);
                    //Parse data for organbezüge, which contains als writing to checkfile
                    var retOrganbezuege = parser_organbezuege.parseOrganbezuege(organbezuege,originline,i,ret);
                    //Push data to returnobject
                    if(retOrganbezuege){
                        if(!ret.organbezuege) ret.organbezuege = [];
                        ret.organbezuege.push(retOrganbezuege);
                    }
                    return i; 
                }
            },
            {

                /** 
                 * Match category of 'Aktionäre' into aktionaer  
                 */
                match: 'b>Aktionäre</b>|b>Aktionäre </b>|b>Aktionär',
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_aktionaere);

                    var originline = i;      
                    var currentline = lines[i];  
                    var linesAktionaer =[]; //Lines related to aktionäre 

                    do{
                        if(currentline && currentline.trim()!=""){

                            cfw.writeHeaderToCheckFile(currentline,
                                cfw.config.checkfile_aktionaere,
                                cfw.config.checkfile_aktionaere_enabled);
                            
                            linesAktionaer.push(currentline);
                        }
                        i++;
                        currentline = lines[i];

                        var currentLineDefined = true;
                        if(!currentline){ 
                            currentLineDefined = false; 
                        }

                        var end1 = currentline.indexOf("<br><center>")!=-1 && currentline.indexOf("Aktionäre")==-1;                        
                        if(end1 && currentLineDefined){
                            linesAktionaer.push(currentline);
                        }
                        var end2 = currentline.indexOf("</body>")!=-1; 
                        var end3 = currentline.indexOf("<br>")!=-1; 

                        //do the loop while the currentline is not defined or the end conditions are hit
                    }while(!currentLineDefined ||(end1 && end2)||(end3 && !end1)) 
    

                    var aktionaerlinesFinal; 
                    if(linesAktionaer.length==1){
                        var linesBRSplit = linesAktionaer[0].split('<br>');
                        var lineBRsplice = linesBRSplit.splice(1);   //Cutout the first line  
                        aktionaerlinesFinal = lineBRsplice; 
                    
                    }else if(linesAktionaer.length==2){
                        var linesBRSplit = linesAktionaer[1].split('<br>');
                        aktionaerlinesFinal = linesBRSplit; 
                    }else{
                        for(var x=1;x<linesAktionaer.length;x++){
                            var cline = linesAktionaer[x];
                            if(cline && cline.indexOf("<br><center><h5>")==-1){
                                if(!aktionaerlinesFinal)aktionaerlinesFinal=[];
                                var clineSplit = cline.split('<br>');                    
                                aktionaerlinesFinal.push.apply(aktionaerlinesFinal,clineSplit);                       
                            }
                      
                        }
                    }
                    //Parse the line for aktionaere  
                    i += 1;
                    var aktionaere = parser_aktionaer.parse_aktionaer(aktionaerlinesFinal,originline,i);
                    if(!ret.aktionaer){
                        ret.aktionaer = [];
                    }
                    //Push it to aktionaer
                    ret.aktionaer.push.apply(ret.aktionaer,aktionaere);
                    _checkInfo('Aktionäre',originline, i, lines);
                    return i-3;
                }, 
            },          
            /** 
             * Match category of 'Public Relations' into publicRelations   
             */
            {
                match: 'b>Public Relations',
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_publicRelations);

                    var originline = i;      
                    var currentline = lines[i];
                    var linesPublicR =[]; //Lines related to Public relations 
                    
                    //Get the lines from HTML 
                    do{
                        if(currentline.trim()!=""){
                            cfw.writeHeaderToCheckFile(currentline,
                                cfw.config.checkfile_publicRelations,
                                cfw.config.checkfile_publicRelations_enabled);
                            
                            linesPublicR.push(currentline);
                        }
                        i++;
                        currentline = lines[i];
                    }while(currentline.substr(0,4)!="<br>") 

                    //Split content again at <br> and create the final array
                    var investorPubLinesFinal; 
                    if(linesPublicR.length==1){
                        var linesBRSplit = linesPublicR[0].split('<br>');
                        var lineBRsplice = linesBRSplit.splice(1);   //Cutout the first line  
                        investorPubLinesFinal = lineBRsplice;          
                    }else{
                        var linesBRSplit = linesPublicR[1].split('<br>');
                        investorPubLinesFinal = linesBRSplit; 
                    }

                    if(!ret.publicRelations){
                        ret.publicRelations = [];
                    }
                    //Parse array
                    var returnobject = parser_persons.parse_investorRelations(investorPubLinesFinal,originline,i,ret);
                    ret.publicRelations.push(returnobject.returnObject);

                    //Sometimes there is stuff missing from the first parse, so do this again untile parsing done 
                    var returnobject = parser_persons.parse_investorRelations(investorPubLinesFinal,originline,i,ret);
                    while(returnobject.restoflines && returnobject.restoflines.length>=1){
                        returnobject = parser_persons.parse_investorRelations(returnobject.restoflines,originline,i,ret);
                        ret.publicRelations.push(returnobject.returnObject);                     
                    }
                    _checkInfo('Public Relations',originline, i, lines);     
                    return i-1;                                                
                }, 
            },
            {
                /** 
                 * Match category of 'Investor Relations' into investorRelations  
                **/
                match: 'b>Investor Relations|b> Investor Relations',
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_investorRelations);

                    var originline = i;      
                    var currentline = lines[i];
                    var linesInvestorR =[]; //Lines related to InvestorRelations 
                    
                    //Get related lines 
                    do{
                        if(currentline.trim()!=""){
                            cfw.writeHeaderToCheckFile(currentline,cfw.config.checkfile_investorRelations,cfw.config.checkfile_investorRelations_enabled);
                            linesInvestorR.push(currentline);
                        }
                        i++;
                        currentline = lines[i];
                    }while(currentline.substr(0,4)!="<br>") 

                    //Split content again at <br> and create the final array
                    var investorRelLinesFinal; 
                    if(linesInvestorR.length==1){
                        var linesBRSplit = linesInvestorR[0].split('<br>');
                        var lineBRsplice = linesBRSplit.splice(1);   //Cutout the first line  
                        investorRelLinesFinal = lineBRsplice;          
                    }else{
                        var linesBRSplit = linesInvestorR[1].split('<br>');
                        investorRelLinesFinal = linesBRSplit; 
                    }

                    i += 1;
                    if(!ret.investorRelations){
                        ret.investorRelations = [];
                    }

                    //Parse the lines and push them to return object
                    var returnobject = parser_persons.parse_investorRelations(investorRelLinesFinal,originline,i,ret);
                    ret.investorRelations.push(returnobject.returnObject);
     
                    //Sometimes there is stuff missing from the first parse, so do this again untile parsing done 
                    while(returnobject.restOfLines && returnobject.restOfLines.length>=1){
                        returnobject = parser_persons.parse_investorRelations(returnobject.restOfLines,originline,i,ret);
                        ret.investorRelations.push(returnobject.returnObject);                     
                    }

                    _checkInfo('Investor Relations',originline, i, lines)       
                    return i-2; 
                                                              
                }, 
            },
            {
                /** 
                 * Match category of 'Gesellschafter' into gesellschafter  
                **/
                match: 'b>Gesellschafter|b> Gesellschafter',  
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_gesellschafter);

                    var originline = i;      
                    i=i+1;
                    var currentline = lines[i];
                    var itemsGesellschafter =[]; //Lines related to Gesellschafter 

                    //Find the related lines
                    do{
                        if(currentline.trim()!=""){
                            //Split lines at br and push them to final array 
                            var currentlineSplit = currentline.split("<br>");
                            for(var x=0;x<currentlineSplit.length;x++){
                                var item = currentlineSplit[x].trim();
                                if(item){
                                    itemsGesellschafter.push(item);                                    
                                }
                            }
                        }
                        i++;
                        currentline = lines[i];
                     
                        var end1 = currentline.indexOf("<br><center><h5><table><tr>");
                        
                    }while(end1==-1)
                    
                    //Parse the found lines
                    var returnobject = parser_persons.parse_gesellschafter(itemsGesellschafter,originline)
                    //Attach them to gesellschafter 
                    _checkInfo('Gesellschafter',originline, i, lines); 
                    ret.gesellschafter = returnobject;
                    //Report to Checkfile
                    cfw.writeToCheckfile(originline,JSON.stringify(itemsGesellschafter, null, " "),
                            JSON.stringify(ret.gesellschafter, null, " "),
                            cfw.config.checkfile_gesellschafter,cfw.config.checkfile_gesellschafter_enabled);
                    
                    return i-1;
                },
            },
            {
                /** 
                 * Match category of 'Anteilseigner' into anteilsEigner  
                **/
                match: 'b>Anteilseigner:|b>Anteilseigner :',
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_anteilseigner);

                    var originline = i;      
                    var currentline = lines[i];
                    var linesAnteilseigner =[]; //Lines related to anteilseigner 

                    //Get the related lines
                    do{
                        if(currentline.trim()!=""){
                            cfw.writeHeaderToCheckFile(currentline,cfw.config.checkfile_anteilseigner,cfw.config.checkfile_anteilseigner_enabled);
                            linesAnteilseigner.push(currentline);
                        }
                        i++;
                        currentline = lines[i];
                    }while(currentline && currentline.substr(0,4)!="<br>") 

                    //Split the lines at br again, create the final array 
                    var anteilsEignerLinesFinal; 
                    if(linesAnteilseigner.length==1){
                        var linesBRSplit = linesAnteilseigner[0].split('<br>'); 
                        var linesBR_BSplit= linesBRSplit[0].split("</b>");
                        if(linesBR_BSplit.length>=2){
                            //Add second element to linesbrsplit as second element
                            linesBRSplit.push(linesBR_BSplit[1]);
                        }

                        var lineBRsplice = linesBRSplit.splice(1);   //Cutout the first line  
                        anteilsEignerLinesFinal = lineBRsplice; 
                    
                    }else{
                        var linesBRSplit = linesAnteilseigner[1].split('<br>');
                        anteilsEignerLinesFinal = linesBRSplit; 
                    }                  
                    i += 1;
                    //Parse the final array and attach it to return object
                    _checkInfo('Anteilseigner',originline, i, lines)
                    var retObject = parser_aktionaer.parse_anteilsEigner(anteilsEignerLinesFinal,originline,i,ret);                                                                
                    ret.anteilsEigner = retObject.anteilsEigner; 
                    return i-3;
                }, 

            },
            {
                /** 
                 * Match category of 'Ausgewählte Beteiligungen' into beteiligungen  
                **/
                match: 'b>Ausgewählte Beteiligungen|b> Ausgewählte Beteiligungen|b>Beteiligung\\(en\\)|b> Beteiligung\\(en\\)', //Not done yet: wird nicht als tabelle behandelt, weil das html fehlerhaft ist
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_beteiligungen);

                    var originline = i;      
                    var currentline = lines[i];
                    //If the first line is a header line, skip it 
                    var firstlineTxt =utils.htmlText2Text(currentline);
                    if(!(firstlineTxt && firstlineTxt.replace("beteiligung","").length>6)){
                        //If the first line is not long increment and take the next one (OK?) 
                        i=i+1;
                        currentline[i];
                    }

                    var linesBeteiligungen =[]; //Lines related to InvestorRelations 
                    //Get the related lines
                    do{
                        if(currentline.trim()!=""){
                            linesBeteiligungen.push(currentline);
                        }
                        i++;
                        currentline = lines[i];
                        var end = currentline.indexOf("<br><center><h5><table><tr>");
                    }while(end==-1) 
 
                    //Prepare the found lines
                   var beteiligungenFinal = parser_aktionaer.prepareBeteiligungen(linesBeteiligungen);
                   if(!beteiligungenFinal)
                   {
                       console.log("something wrong"); 
                       debugger;
                   }                   
                                    
                   var returnbet =  parser_aktionaer.parse_beteiligungen2(beteiligungenFinal);
                   
                   cfw.writeToCheckfile(originline,JSON.stringify(linesBeteiligungen, null, " "),
                        JSON.stringify(returnbet, null, " "),cfw.config.checkfile_beteiligungen,
                        cfw.config.checkfile_beteiligungen_enabled);
                   
                   ret.beteiligungen = returnbet;                                       
                    _checkInfo('Ausgewählte Beteiligungen',originline, i, lines);        
                    return originline+1;  //Sometimes there are really less lines here         
                } 
            },
            {
                /** 
                 * Match category of 'Wesentliche Beteiligungen' into beteiligungen  
                **/
                match: 'b>Wesentliche Beteiligungen', 
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_beteiligungen+"Wesentliche");

                    var originline = i;      
                    i=i+1; //Start of with one line further
                    var currentline = lines[i];
                    var linesAcc=""; 

                    var linesBeteiligungen =[]; //Lines related to wesentliche beteiligungen 
                    do{
                        if(currentline && currentline.trim()!=""){
                            linesBeteiligungen.push(currentline);
                            linesAcc = linesAcc+" "+currentline;
                        }
                        i++;
                        currentline = lines[i];
                        var currentLineDefined = true;
                        if(!currentline){ 
                            currentLineDefined = false; 
                            continue;
                        }

                        var end = currentline.indexOf("b>Kapital");
                        var end2 = currentline.indexOf("b>Börsen");
                    }while(!currentLineDefined||(end==-1 && end2 == -1)) 
     
                    //Take the standard parsing method here 
                    var returnobject = parser_tables.recognizeTableArrays(linesBeteiligungen);
                    var tablesArr = returnobject.tablesArr;
                    var rest      = returnobject.rest;
                    var infos     = returnobject.infos;


                 
                    var tablesParsed = parser_tables.createParsedTables(tablesArr); 
                    
                   _checkInfo('Wesentliche Beteiligungen',originline, i, lines);
                   cfw.writeHeaderToCheckFile(returnobject,cfw.config.checkfile_beteiligungen,cfw.config.checkfile_beteiligungen_enabled);
                   //Parse content
                   var returnbet =  parser_aktionaer.parse_beteiligungen(tablesArr,tablesParsed,rest,infos);
                   //Write content to checkfile
                   cfw.writeToCheckfile(originline,JSON.stringify(tablesArr, null, " ")+JSON.stringify(rest,null,""),
                            JSON.stringify(returnbet, null, " "),cfw.config.checkfile_beteiligungen,cfw.config.checkfile_beteiligungen_enabled);
                   
                   ret.beteiligungen = returnbet;   
                   return i-2;
                } 
            },
            {   
                /**
                 * Match category Unternehmensverträge and Abfindungsangebote into unternehmensVertraege
                 */
                match: 'b>Unternehmensvert|Abfindungsangebote</b',
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_unternehmensVertraege);
                    
                    var originline = i;      
                    i=i+1; //Start of with one line further
                    var currentline = lines[i];
                    var linesAcc=""; 

                    var itemsUnternehmensVertraege =[]; //Lines related to unternehmensverträge 
                    //Find related items
                    do{
                        if(currentline && currentline.trim()!=""){
                            //Split at linebreak
                            var currentlineSplit = currentline.split("<br>"); 

                            for(var x=0;x<currentlineSplit.length;x++){
                                var lineitem = currentlineSplit[x].trim();
                                if(lineitem){
                                    itemsUnternehmensVertraege.push(lineitem);                                    
                                }
                            }

                            linesAcc = linesAcc+" "+currentline;
                        }
                        i++;
                        currentline = lines[i];

                        var end = currentline.indexOf("<br><center><h5><table><tr>");
                    }while(end==-1) 
                    
                    //Create item in returnobject, no parsing required    
                    ret.unternehmensVertraege = itemsUnternehmensVertraege;
                    return i;
                }
            },
            { 
                /**
                 * Match category Kapitalentwicklung and Kapital and Kapitalangaben into 
                 * many different returnobjects:
                 * kapitalentwicklung,grundkapital,genehmigtes kapital, 
                 * genehmigtes genußkapital, derzeitiges genußkapital, 
                 * derzeitige entwicklung des genußkapitals, bedingkapital, 
                 * bedingkapital2, bezugsrechte, ausgegebenes kapital,
                 * ermächtigung aktienerwerb 
                 */
                match: 'b>Kapitalentwicklung|b>Kapital</b>|b>Kapitalangaben', 
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_kapitalentwicklung);

                    var originline = i;      
                    i=i+1; //Start of with one line further
                    var currentline = lines[i];
                    var linesAcc=""; 
                    

                    var linesKapitalentwicklung =[]; //Lines related to Kapitalentwicklung 
                    do{
                        if(currentline && currentline.trim()!=""){
                            linesKapitalentwicklung.push(currentline);
                            linesAcc = linesAcc+" "+currentline;
                        }
                        i++;
                        currentline = lines[i];
                        var end = currentline.indexOf("<br><center><h5><table><tr>");
                    }while(end==-1) 

                    //Recognize all tables related to kapitalentwicklung
                    var returnobject = parser_tables.recognizeTableArrays(linesKapitalentwicklung);
                    var tablesArr = returnobject.tablesArr;
                    var rest      = returnobject.rest;
                    var infos     = returnobject.infos;
                    //Parsen the tables and recognize, what table is related to what content...
                    var tablesParsed = parser_tables.createParsedTables(tablesArr); 
                    var recTables =parser_tables.recognizeTableContent(tablesParsed,"kapitalentwicklung");   
                    //Sanitize tables (sometimes there is just a headline followed by a not recognized table, this associates this)  
                    var substitutedKeys = [];
                    for(var x=0;x<tablesParsed.length;x++){
                        var curtable = tablesParsed[x];
                        var associatedKeys = utils.getKeysByValue(recTables,x);

                        if(associatedKeys.length==0){
                            //This table was not associated-> change 
                            //Get the indices of the previous table
                            var previousIndexKeys = utils.getKeysByValue(recTables,x-1);
                            //If the previous table is very short, this means it's just a 'headline-table'
                            //Therefore increment the associated index 
                            if(previousIndexKeys.length>=1){
                                var previousTableIndex = recTables[previousIndexKeys[0]];
                                var previousTable = tablesParsed[previousTableIndex];
                                if(previousTable.length<=1){
                                    //Substitute 
                                    recTables[previousIndexKeys[0]]=x;
                                    substitutedKeys.push(previousIndexKeys[0]);
                                }
                            }
                            //Note down the sanitation triggered
                            cfw.writeToCheckfile(originline,"Sanitation was triggered for table:"+x+" "+JSON.stringify(substitutedKeys, null, " "),
                                "",cfw.config.checkfile_sanitation_kapitalentwicklung,cfw.config.checkfile_sanitation_kapitalentwicklung_enabled);
                            
                        }
                    }


                    var retKapitalEntwicklung;
                    if(!isNaN(recTables.kapitalEntwicklungIndex)){
                        retKapitalEntwicklung = parser_tables.parse_kapitalEntwicklung(tablesParsed,recTables.kapitalEntwicklungIndex);
                    }

                    var retGrundkapital;
                    if(!isNaN(recTables.grundkapitalIndex)){
                        retGrundkapital = parser_tables.parse_grundkapital(tablesParsed,tablesArr,rest,infos,recTables.grundkapitalIndex);
                    }

                    //Parse Genehmigtes Kapital
                    var retGenehmkapital; 
                    if(!isNaN(recTables.genehmKapitalIndex)){
                        var nextIndex = parser_tables.getNextIndex(recTables,recTables.genehmKapitalIndex);
                        retGenehmkapital = parser_tables.parse_genehmKapital(tablesParsed,tablesArr,rest,infos,recTables.genehmKapitalIndex,nextIndex,substitutedKeys);
                    }

                    //Parse Genehmigtes Genußkapital
                    var retGenehmGenusKapital; 
                    if(!isNaN(recTables.genehmGenusKapitalIndex)){
                        var nextIndex = parser_tables.getNextIndex(recTables,recTables.genehmGenusKapitalIndex);
                        retGenehmGenusKapital = parser_tables.parse_genehmKapital(tablesParsed,tablesArr,rest,infos,recTables.genehmGenusKapitalIndex,nextIndex,substitutedKeys);
                    }

                    //Parse Derzeitiges Genußkapital
                    var retDerzeitGenusKapital; 
                    if(!isNaN(recTables.derzeitigesGenusKapitalIndex)){
                        var nextIndex = parser_tables.getNextIndex(recTables,recTables.derzeitigesGenusKapitalIndex);
                        retDerzeitGenusKapital = parser_tables.parse_grundkapital(tablesParsed,tablesArr,rest,infos,recTables.derzeitigesGenusKapitalIndex,"genu");
                    }

                    //Parse Entwicklung des Genußkapitals 
                    var retEntwicklungDesGenusKapitals; 
                    if(!isNaN(recTables.entwicklungGenusKapitalIndex)){
                        var nextIndex = parser_tables.getNextIndex(recTables,recTables.entwicklungGenusKapitalIndex);
                        retEntwicklungDesGenusKapitals = parser_tables.parse_entwicklungGenusKapital(tablesParsed,recTables.entwicklungGenusKapitalIndex,nextIndex);
                    }

                    //Parse Bedingtes Kapital 
                    var retBedingKapital;
                    if(!isNaN(recTables.bedingKapitalIndex)){
                        var nextIndex = parser_tables.getNextIndex(recTables,recTables.bedingKapitalIndex);
                        retBedingKapital = parser_tables.parse_bedingKapital(tablesParsed,tablesArr,rest,infos,recTables.bedingKapitalIndex,nextIndex);
                    }
                    //Parse Bedingtes Kapital 2 (Sometimes there are additional entries)
                    var retBedingKapital2;                    
                    if(!isNaN(recTables.bedingKapitalIndex2)){
                        var nextIndex = parser_tables.getNextIndex(recTables,recTables.bedingKapitalIndex2);
                        retBedingKapital2 = parser_tables.parse_bedingKapital(tablesParsed,tablesArr,rest,infos,recTables.bedingKapitalIndex2,nextIndex);                       
                    }
                    //Parse Besondere Bezugsrechte 
                    var retBesBezugsrechte; 
                    if(!isNaN(recTables.besBezugsrechteIndex)){
                        var nextIndex = parser_tables.getNextIndex(recTables,recTables.besBezugsrechteIndex);
                        retBesBezugsrechte = parser_tables.parse_besBezugsrechte(tablesParsed,tablesArr,rest,infos,recTables.besBezugsrechteIndex,nextIndex);
                    }

                    //Parse Ausgegebenes Kapital 
                    var retAusgegebenesKapital; 
                    if(!isNaN(recTables.ausgegebenesKapitalIndex)){
                        var nextIndex = parser_tables.getNextIndex(recTables,recTables.ausgegebenesKapitalIndex);
                        retAusgegebenesKapital = parser_tables.parse_ausgegebenesKapital(tablesParsed,tablesArr,rest,infos,recTables.ausgegebenesKapitalIndex,nextIndex);
                    }

                    //Parse Ermächtigung Aktienerwerb 
                    var retErmächtigungAktienerwerb;
                    if(!isNaN(recTables.ermaechtigungAktienErwerbIndex)){
                        var nextIndex = parser_tables.getNextIndex(recTables,recTables.ermaechtigungAktienErwerbIndex);
                        retErmächtigungAktienerwerb = parser_tables.parse_ermAktienerwerb(tablesParsed,tablesArr,rest,infos,recTables.ermaechtigungAktienErwerbIndex,nextIndex);
                        cfw.writeToCheckfile(originline,JSON.stringify(tablesArr, null, " ")+JSON.stringify(rest,null,""),JSON.stringify(retErmächtigungAktienerwerb, null, " "),cfw.config.checkfile_ermAktienerwerb,cfw.config.checkfile_ermAktienerwerb_enabled);
                    }

                    cfw.writeToCheckfile(originline,JSON.stringify(tablesArr, null, " "),JSON.stringify(retKapitalEntwicklung, null, " "),cfw.config.checkfile_kapitalentwicklung,cfw.config.checkfile_kapitalentwicklung_enabled);
                    cfw.writeToCheckfile(originline,JSON.stringify(tablesArr, null, " ")+JSON.stringify(rest,null,""),JSON.stringify(retGrundkapital, null, " "),cfw.config.checkfile_grundkapital,cfw.config.checkfile_grundkapital_enabled);
                    cfw.writeToCheckfile(originline,JSON.stringify(tablesArr, null, " ")+JSON.stringify(rest,null,""),JSON.stringify(retGenehmkapital, null, " "),cfw.config.checkfile_genehmkapital,cfw.config.checkfile_genehmkapital_enabled);
                    cfw.writeToCheckfile(originline,JSON.stringify(tablesArr, null, " ")+JSON.stringify(rest,null,""),JSON.stringify(retBedingKapital, null, " "),cfw.config.checkfile_bedingkapital,cfw.config.checkfile_bedingkapital_enabled);
                    //cfw.writeToCheckfile(originline,JSON.stringify(tablesArr, null, " ")+JSON.stringify(rest,null,""),JSON.stringify(retBesBezugsrechte, null, " "),cfw.config.checkfile_besbezugsrechte,cfw.config.checkfile_besbezugsrechte_enabled);
                    cfw.writeToCheckfile(originline,JSON.stringify(tablesArr, null, " ")+JSON.stringify(rest,null,""),JSON.stringify(retBesBezugsrechte, null, " "),cfw.config.checkfile_besbezugsrechte,cfw.config.checkfile_besbezugsrechte_enabled);
                    cfw.writeToCheckfile(originline,JSON.stringify(tablesArr, null, " ")+JSON.stringify(rest,null,""),JSON.stringify(retAusgegebenesKapital, null, " "),cfw.config.checkfile_ausgegebenesKapital,cfw.config.checkfile_ausgegebenesKapital_enabled);
                    cfw.writeToCheckfile(originline,JSON.stringify(tablesArr, null, " ")+JSON.stringify(rest,null,""),JSON.stringify(retBedingKapital2, null, " "),cfw.config.checkfile_bedingkapital,cfw.config.checkfile_bedingkapital_enabled);
                    
                    //If the return objects are defined, the objects are attached to the common return object
                    if(retKapitalEntwicklung){
                        ret.kapitalEntwicklung = retKapitalEntwicklung;    
                    }
                    if(retGrundkapital && retGrundkapital.grundkapital){ 
                        ret.grundkapital = retGrundkapital.grundkapital;
                    }
                    if(retGrundkapital && retGrundkapital.stimmrecht){
                        ret.stimmrecht = retGrundkapital.stimmrecht;
                    }
                    if(retGrundkapital && retGrundkapital.stückelung){
                        ret.stückelung = retGrundkapital.stückelung;
                    }                 
                    if(retGenehmkapital){
                        ret.genehmigtesKapital = retGenehmkapital;
                    } 
                    if(retGenehmGenusKapital){
                        ret.genehmigtesGenusKapital = retGenehmGenusKapital;
                    }
                    if(retDerzeitGenusKapital){
                        ret.derzeitigesGenusKapital = retDerzeitGenusKapital.grundkapital;
                    }
                    if(retEntwicklungDesGenusKapitals){
                        ret.entwicklungDesGenusKapitals = retEntwicklungDesGenusKapitals;
                    }              
                    if(retBedingKapital){
                        ret.bedingtesKapital = retBedingKapital;
                    }  
                    if(retBedingKapital2){
                        ret.bedingtesKapital2 = retBedingKapital2;
                    }
                    if(retBesBezugsrechte){
                        ret.besBezugsrechte = retBesBezugsrechte;
                    }  
                    if(retErmächtigungAktienerwerb){
                        ret.ermächtigungAktienerwerb = retErmächtigungAktienerwerb;
                    }
                    if(retAusgegebenesKapital){
                        ret.ausgegebenesKapital = retAusgegebenesKapital;
                    }
                    _checkInfo('Kapitalentwicklung',originline, i, lines);
                    return i;
                } 
            },
            {  /**
                * Match Wertpapier-Kenn-Nr and ISIN to boersenbewertung, which is an accumulated field
                * over multiple matching functions and is also enumerated 
                *
                * Hint: This doesn't work without enabled return values of i
                */
                match: 'Wertpapier-Kenn-Nr|ISIN:', 
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_boersenbewertung);

                    var originline = i;      
                    //i=i+1; //Start of with one line further
                    var currentline = lines[i];
                    var linesAcc=""; 
                    

                    var linesBoersenbewertung =[]; //Lines related to Boersenbewertung 
                    do{
                        if(currentline && currentline.trim()!=""){
                            linesBoersenbewertung.push(currentline);
                            linesAcc = linesAcc+" "+currentline;
                        }
                        i++;
                        currentline = lines[i];
                        //cfw.writeHeaderToCheckFile(currentline,cfw.config.checkfile_kapitalentwicklung,cfw.config.checkfile_kapitalentwicklung_enabled);

                        var currentLineDefined = true;
                        if(!currentline){ 
                            currentLineDefined = false; 
                            continue;
                        }

                        var end = currentline.indexOf("b>Bereinigte Kurse");
                        if(end!=-1){ //There is additional stuff altough last line is not recognized
                            var clineSplit = currentline.split("<br>");
                            for(var x=0;x<clineSplit.length;x++){
                                var text =  utils.htmlText2Text(clineSplit[x]);
                                var textF = text.replace('Bereinigte Kurse',"");
                                linesBoersenbewertung.push(textF);
                                linesAcc = linesAcc+" "+textF;
                            }
 
                        }
                        var end2 = currentline.indexOf("b>Kurse");
                        var end3 = currentline.indexOf("b>Dividenden");
                        var end4 = currentline.indexOf("</body>"); 
                        var end5 = currentline.indexOf("b>Kennzahlen");
                    }while(!currentLineDefined||(end==-1 && end2==-1 && end3==-1 && end4==-1 && end5==-1)) 
                    i=i-1;

                    //Parse Boersenbewertung
                    var currentCallCount = callCounter.getCurrentCount(cfw.config.checkfile_boersenbewertung);
                    var retBoersenbewertung = parser_boersenbewertung.parse_boersenbewertung(linesBoersenbewertung,currentCallCount);
                    
                    cfw.writeToCheckfile(originline,JSON.stringify(linesBoersenbewertung, null, " "),
                        JSON.stringify(retBoersenbewertung, null, " "),cfw.config.checkfile_boersenbewertung,
                        cfw.config.checkfile_boersenbewertung_enabled);
                    
                    //Add the keys of retBoersenbewertung to common return object, which can also contain additional keys
                    if(retBoersenbewertung){
                        if(!ret.boersenbewertung){
                            ret.boersenbewertung = {};
                        }
                        for(var key in retBoersenbewertung){
                            if(!ret.boersenbewertung[key]){
                                ret.boersenbewertung[key] = retBoersenbewertung[key];
                            }else if(retBoersenbewertung[key]){
                                Object.assign(ret.boersenbewertung[key],retBoersenbewertung[key]);
                            }else{
                                debugger;
                            }
                        }
                    }
                    _checkInfo('Börsenbewertung',originline, i, lines)
                    return i;
                } 
            },
            {
                /**
                 * Match Bereinigte Kurse and Kurse to retBereinigteKurse
                 */
                match: 'b>Bereinigte Kurse|b>Kurse', 
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_bereinigtekurse);

                    var originline = i;      
                    //i=i+1; //Start of with one line further
                    var currentline = lines[i];
                    var linesAcc=""; 
                    

                    var linesBereinigteKurse =[]; //Lines related to Bereinigte Kurse 

                    //Get the related lines
                    do{
                        if(currentline && currentline.trim()!=""){
                            linesBereinigteKurse.push(currentline);
                            linesAcc = linesAcc+" "+currentline;
                        }
                        i++;
                        currentline = lines[i];
                        //cfw.writeHeaderToCheckFile(currentline,cfw.config.checkfile_kapitalentwicklung,cfw.config.checkfile_kapitalentwicklung_enabled);
                        var currentLineDefined = true;
                        if(!currentline){ 
                            currentLineDefined = false; 
                            continue;
                        }

                        var end = currentline.indexOf("<center><img");
                        var end2 = currentline.indexOf("b>Dividenden");
                        var end3 = currentline.indexOf("b>Halbjahresdividenden");
                        var end4 = currentline.indexOf("b>Quartalsdividenden");
                        var end5 = currentline.indexOf("</body>");
                        var end6 = currentline.indexOf("br><center><h5><table>");
                        var end7 = currentline.indexOf("<center><b>Kennzahlen");
                        var end8 = currentline.indexOf("<br><img");
                        var end9 = currentline.indexOf("Wertpapier-Kenn-Nr.:");

                        //Note to loop, loop goes on if no current line defined, ends when end string found
                    }while(!currentLineDefined||(end==-1 && end2==-1 && end3==-1 && end4==-1 && end5==-1 && end6==-1 && end7==-1 && end8==-1 && end9==-1)) 

                    var returnobject = parser_tables.recognizeTableArrays(linesBereinigteKurse);
                    var tablesArr = returnobject.tablesArr;
                    var rest      = returnobject.rest;
                    var infos     = returnobject.infos;
            

                    var tablesParsed = parser_tables.createParsedTables(tablesArr); 
                    
                    var currentCallCount = callCounter.getCurrentCount(cfw.config.checkfile_boersenbewertung);
                    var retBereinigteKurse = parser_tables.parse_bereinigtekurse(tablesParsed,tablesArr,rest,infos,currentCallCount);

                    cfw.writeToCheckfile(originline,JSON.stringify(tablesArr, null, " "),
                        JSON.stringify(retBereinigteKurse, null, " "),
                        cfw.config.checkfile_bereinigtekurse,cfw.config.checkfile_bereinigtekurse_enabled);
                    
                    //Add the keys of retBereinigteKurse to common return object, which can also contain additional keys
                    if(retBereinigteKurse){
                        if(!ret.boersenbewertung){
                            ret.boersenbewertung = [];
                        }       
                        for(var k in retBereinigteKurse){
                            if(retBereinigteKurse[k] && ret.boersenbewertung[k] ){
                                Object.assign(ret.boersenbewertung[k], retBereinigteKurse[k]);
                            }else{
                                debugger;
                            }
                        } 
                    }
                    i = i-3;
                    _checkInfo('Kurse',originline, i, lines)
                    return i-3;     
                } 
            },
            {
                /**
                 * Match Dividenden and assign them to borsenbewertung
                 */
                match: 'b>Dividenden', 
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_dividenden);

                    var originline = i;      
                    var currentline = lines[i];
                    var linesAcc=""; 
                    

                    var linesDividenden =[]; //Lines related to dividende
                    
                    //Get related lines  
                    do{
                        if(currentline && currentline.trim()!=""){
                            linesDividenden.push(currentline);
                            linesAcc = linesAcc+" "+currentline;
                        }
                        i++;
                        currentline = lines[i];
                   
                        //cfw.writeHeaderToCheckFile(currentline,cfw.config.checkfile_kapitalentwicklung,cfw.config.checkfile_kapitalentwicklung_enabled);
                        var currentLineDefined = true;
                        if(!currentline){ 
                            currentLineDefined = false; 
                            continue;
                        }

                        var end = currentline.indexOf("<center><b>");
                        var end2 = currentline.indexOf("<br><img");
                        var end3 = currentline.indexOf("<center><img");
                        var end4 = currentline.indexOf("<br><center>");
                        var end5 = currentline.indexOf("</body>");
                        var end6 = currentline.indexOf("<br><br>");
                        var end7 = currentline.indexOf("Ergebnisabführung");
                        //Note to loop, loop goes on if no current line defined, ends when end string found
                    }while(!currentLineDefined||(end==-1 && end2==-1 && end3==-1 && end4==-1 && end5==-1 && end6==-1 && end7==-1)) 

                    //Get related Tables from lines 
                    var returnobject = parser_tables.recognizeTableArrays(linesDividenden);
                    var tablesArr = returnobject.tablesArr;
                    var rest      = returnobject.rest;
                    var infos     = returnobject.infos;
                    
                    //Parse the content
                    var tablesParsed = parser_tables.createParsedTables(tablesArr); 
                    var currentCallCount = callCounter.getCurrentCount(cfw.config.checkfile_boersenbewertung);
                    var retDividenden = parser_tables.parse_dividenden(tablesParsed,tablesArr,rest,infos,currentCallCount);

                    cfw.writeToCheckfile(originline,JSON.stringify(tablesArr, null, " "),JSON.stringify(retDividenden, null, " "),cfw.config.checkfile_dividenden,cfw.config.checkfile_dividenden_enabled);
                    if(!ret.boersenbewertung) ret.boersenbewertung = [];
                    
                    //Add the keys of retDividenden to common return object, which can also contain additional keys
                    for(var k in retDividenden){
                        if(ret.boersenbewertung[k] && retDividenden[k]){ 
                            Object.assign(ret.boersenbewertung[k], retDividenden[k]);
                        }else{
                            debugger;
                        }
                    } 
                    _checkInfo('Dividenden',originline, i, lines);
                    return i-3;    
                } 
            },
            {
                /**
                 * Parse ergebnisabführung to boersenbewertung
                 */
                match: '>Ergebnisabführung',  
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_ergebnisabfuehrung);

                    //Returns the next index, writes results to ret.boersenbewertung
                    var retval = parser_additions.parseErgebnisAbfuehrung(lines,i,ret,callCounter,_checkInfo);
                    return retval;
                } 
            },
            {
                /**
                 * Match kennzahlen and parse them to boersenbewertung 
                 */
                match: 'Kennzahlen',//obsolete: 'b>Kennzahlen|>Kennzahlen', 
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_kennzahlen);

                    var originline = i;      
                    i=i+1; //Start of with one line further
                    var currentline = lines[i];
                    var linesAcc=""; 
                    
                    var linesKennzahlen =[]; //Lines related to Bereinigte Kurse 
                    do{
                        if(currentline && currentline.trim()!=""){
                            linesKennzahlen.push(currentline);
                            linesAcc = linesAcc+" "+currentline;
                        }
                        i++;
                        currentline = lines[i];
                
                        var currentLineDefined = true;
                        if(!currentline){ 
                            currentLineDefined = false; 
                            continue;
                        }

                        var end = currentline.indexOf("<center><b>");
                        var end2 = currentline.indexOf("<br><img");
                        var end3 = currentline.indexOf("<center><img");
                        var end4 = currentline.indexOf("<br><center>");
                        var end5 = currentline.indexOf("</body>");
                
                        //Note to loop, loop goes on if no current line defined, ends when end string found
                    }while(!currentLineDefined||(end==-1 && end2==-1 && end3==-1 && end4==-1 && end5==-1)) 

                    var returnobject = parser_tables.recognizeTableArrays(linesKennzahlen);
                    var tablesArr = returnobject.tablesArr;
                    var rest      = returnobject.rest;
                    var infos     = returnobject.infos;
        
                    var tablesParsed = parser_tables.createParsedTables(tablesArr); 
                     
                    //Get the call count of boersenbewertung, to assign it to the current item 
                    var currentCallCount = callCounter.getCurrentCount(cfw.config.checkfile_boersenbewertung);
                    if(!currentCallCount)currentCallCount = 1;
                    var retKennzahlen = parser_tables.parse_kennzahlen(tablesParsed,tablesArr,rest,infos,currentCallCount);
                    
                    //Write the result to checkfile
                    cfw.writeToCheckfile(originline,JSON.stringify(tablesArr, null, " "),
                            JSON.stringify(retKennzahlen, null, " "),
                            cfw.config.checkfile_kennzahlen,
                            cfw.config.checkfile_kennzahlen_enabled);

                    //Attach the results to ret.boersenbwertung
                    if(!ret.boersenbewertung) ret.boersenbewertung = {};
                    
                    for(var k in retKennzahlen){
                        if(!ret.boersenbewertung[k]){
                             ret.boersenbewertung[k]={}; 
                        }
                        
                        Object.assign(ret.boersenbewertung[k], retKennzahlen[k]);
                    } 

                    _checkInfo('Kennzahlen',originline, i, lines);
                    return i-1;   //is i here ok TODO 
                } 
            },
            {
                /**
                 * Match 'Aus den Bilanzen' to ausbilanzen in ret json object
                 */
                match: 'b>Aus den Bilanzen', 
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_aus_bilanzen);

                    var originline = i;     
                    var headline = lines[i];

                    i=i+1; //Start of with one line further
                    var currentline = lines[i];
                    var linesAcc=""; 
                    
                    //Get related lines to Bilanzen
                    var linesBilanzen =[]; //Lines related to Bilanzen 
                    do{
                        if(currentline && currentline.trim()!=""){
                            linesBilanzen.push(currentline);
                            linesAcc = linesAcc+" "+currentline;
                        }
                        i++;
                        currentline = lines[i];
                
                        var currentLineDefined = true;
                        if(!currentline){ 
                            currentLineDefined = false; 
                            continue;
                        }

                        var end = currentline.indexOf("<center><b>");
                        var end2 = currentline.indexOf("<br><img");
                        var end3 = currentline.indexOf("<center><img");
                        var end4 = currentline.indexOf("<br><center>");
                        var end5 = currentline.indexOf("</body>");
                
                        //Note to loop: loop goes on if no current line defined, ends when end string found
                    }while(!currentLineDefined||(end==-1 && end2==-1 && end3==-1 && end4==-1 && end5==-1)) 

                    //Get tables 
                    var returnobject = parser_tables.recognizeTableArrays(linesBilanzen);
                    var tablesArr = returnobject.tablesArr;
                    var rest      = returnobject.rest;
                    var infos     = returnobject.infos;
        
                    var tablesParsed = parser_tables.createParsedTables(tablesArr); 
                    //Parse content to retAusBilanzen
                    var retAusBilanzen = parser_tables.parse_aus_bilanzen(tablesParsed,tablesArr,rest,infos,headline);
                    //Note down results to checkfile
                    cfw.writeToCheckfile(originline,JSON.stringify(tablesArr, null, " "),
                                JSON.stringify(retAusBilanzen, null, " "),
                                cfw.config.checkfile_aus_bilanzen,cfw.config.checkfile_aus_bilanzen_enabled);

                    //Attach result to returnobject
                    if(!ret.ausBilanzen) ret.ausBilanzen = [];
                    ret.ausBilanzen.push(retAusBilanzen);
                    _checkInfo('Aus den Bilanzen',originline, i, lines);
                    return i-1;   
                } 
            },
            {
                /**
                 * Match: Aus den Gewinn- und Verlustrechnungen and parse it to 'ausGewinnUndVerlust'
                 * in returnarray 
                 */
                match: 'b>Aus den Gewinn- und Verlustrechnungen', 
                fn: (lines, i, ret) => {
                    callCounter.countCalls(cfw.config.checkfile_aus_den_gewinn_und_verlustrechnungen);
                    
                    var headline = lines[i]; 
                    var originline = i;      
                    i=i+1; //Start of with one line further
                    var currentline = lines[i];
                    var linesAcc=""; 
                    
                    //Get related lines
                    var linesGewinnUndVerlust =[]; //Lines related to Gewinn- und Verlustrechnungen 
                    do{
                        if(currentline && currentline.trim()!=""){
                            linesGewinnUndVerlust.push(currentline);
                            linesAcc = linesAcc+" "+currentline;
                        }
                        i++;
                        currentline = lines[i];
                
                        var currentLineDefined = true;
                        if(!currentline){ 
                            currentLineDefined = false; 
                            continue;
                        }

                        var end = currentline.indexOf("<center><b>");
                        var end2 = currentline.indexOf("<br><img");
                        var end3 = currentline.indexOf("<center><img");
                        var end4 = currentline.indexOf("<br><center>");
                        var end5 = currentline.indexOf("</body>");
                
                        //Note to loop, loop goes on if no current line defined, ends when end string found
                    }while(!currentLineDefined||(end==-1 && end2==-1 && end3==-1 && end4==-1 && end5==-1)) 
                    //Get tables from lines 
                    var returnobject = parser_tables.recognizeTableArrays(linesGewinnUndVerlust);
                    var tablesArr = returnobject.tablesArr;
                    var rest      = returnobject.rest;
                    var infos     = returnobject.infos;
                    this.addLineArrayToAnalysis(linesGewinnUndVerlust);
        
                    var tablesParsed = parser_tables.createParsedTables(tablesArr); 
                    //Parse the tables 
                    var retAusGewinnUndVerlust = parser_tables.parse_aus_gewinn_und_verlustrechnungen(tablesParsed,tablesArr,rest,infos,headline);

                    //Note results to checkfile
                    cfw.writeToCheckfile(originline,JSON.stringify(tablesArr, null, " "),
                        JSON.stringify(retAusGewinnUndVerlust, null, " "),
                        cfw.config.checkfile_aus_den_gewinn_und_verlustrechnungen,
                        cfw.config.checkfile_aus_den_gewinn_und_verlustrechnungen_enabled);

                    //Attach result to return object
                    if(!ret.ausGewinnUndVerlust)ret.ausGewinnUndVerlust = [];
                    ret.ausGewinnUndVerlust.push(retAusGewinnUndVerlust);
                    _checkInfo('Aus Gewinn und Verlust',originline, i, lines);
                    //Return index
                    return i-1;   
                } 
            } 
            
        ]
    }
    /**
     * Export the vocabulary
     * @param {boolean} enabled 
     */
    setExportVocabulary(enabled)
    {
        this.exportVocabulary = enabled
    }
    /**
     * Starting point for parser.js, loads dictionary, creates checkfile headers and
     * then triggers the file parsing.
     * @param {string} filename path and filename of the file to parse
     */
    parseFile(filename) {
        console.log("Parser.js parsing file: ",filename);
        //Note to the callcounter, that another file is in use
        callCounter.switchFile(filename);
        //Write the headers to all checkfiles
        cfw.writeAllFilenameHeaderToAllFiles(filename);
        //Call parse function for read file
        return this.parse(fs.readFileSync(filename, {encoding: 'utf8'}))
    }
    doExportVocabulary(line){
        //console.log("input is:",line)
        var line_no_html = utils.htmlText2Text(line, true).trim();
        var line_prepared =  line_no_html.trim();
        //console.log("prepared line is", line_prepared)
        
        if(line_prepared==""){
            return 
        }
        var line_split = line_prepared.split(/[\s\t\n]+/)
        var line_split_length = line_split.length;
        for(var i = 0; i < line_split_length; i++){
            var item = line_split[i].trim()
            if(item==""){
                continue
            }
            console.log("item:", item)
            item = item.trim();
            var item_without_sep_chars = utils.removeSeparatorChars(item).trim()
            if(item_without_sep_chars==""){
                continue
            }

            if(isNaN(item_without_sep_chars)){
                if(item.length<=1){
                    continue
                }

                cfw.writeHeaderToCheckFile(item,
                    cfw.config.checkfile_dictionary, cfw.config.checkfile_dictionary_enabled)
                console.log("dict. writing:", item)

            }else{
                //debugger
            }
        }
        
        //cfw.writeHeaderToCheckFile(line_prepared,
        //    cfw.config.checkfile_dictionary, cfw.config.checkfile_dictionary_enabled)


    }
    /**
     * Parse the string which usually is html-file content line for line.
     * Create a json object for the file. Save the full-html text to this json-object.
     * Go through each line and check if there are matches. If theres a match, hop 
     * the lines which are related to the match. 
     * 
     * @param {string} linesStr html-file content
     */
    parse(linesStr) {
        var linestemp = linesStr.split('\n');
        var start_index = linestemp.indexOf("</head>")+2
        linestemp[start_index] = "AKF_PARSER_START";
        const lines = linestemp;

        const ret = {};
        
        ret._fulltext = linesStr
            .replace(/<head>[\s\S]*<\/head>/i,'')   //replace all whitespace and n-whitespace characters between the header and the header tags 
            .replace(/<br>/g," ")
            .replace(/<[^>]+>/g,'')                 //replace all html opening or closing tags in this script
        

        for (let i = 0; i < lines.length; i++) {        
            if (this.exportVocabulary && i> start_index){
                 this.doExportVocabulary(lines[i])
                 continue
            }
            for (let parseFunction of this._parseFunctions) {               
                //if the line matches a string in the parsefunction match call the corresponding parser function 
                var lineTrim = lines[i].trim(); 
                //if there is a match for a category
                if (lineTrim.match(parseFunction.match) && !parseFunction.disabled) {
                    //call the parse function and increment i, or take the old i when i is not returned
                    i = parseFunction.fn(lines, i, ret) || i;  
                    break;
                }
            }
        }

        return ret;
    }

    /**
     * Helper function for lineSegmentAnalyzer
     * 
     * adds a set of lines to the analyzer for further investigation
     * @param {array} lineArray 
     */
    addLineArrayToAnalysis(lineArray){
        lineSegmentAnalyzer.addLineArrayToSet(lineArray);
    }
    
    /**
     * Helper function for line segment analyzer, gets called from akf-html2json at 
     * the moment. Basically defines the options for lse and triggers the analysis
     * @param {array} dataToParse array which gets added to lse for analysis, can be undefined
     * @param {string} identifier is a name for the created dataset to find it later
     * @param {boolean} zumsteinVector true:only special characters are analyzed and one counting segment is used
     */
    doLineSegmentAnalysis(dataToParse,identifier,zumsteinVector){
        //Don't count whitespaces as analysis object
        var printOptions = {
            ignoreWhitespaces: true
        }
        //Set options 
        var datasetOptions = {
            name: identifier,
            zumsteinVector: zumsteinVector //use zumsteinVector special configuration  
        }
        //Add dataToParse to set if defined
        if(dataToParse){
            lineSegmentAnalyzer.addLineArrayToSet(dataToParse);
        }
        //Create the dataset which can be analzed
        lineSegmentAnalyzer.createLocalDataset(datasetOptions);
        //Analyze the dataset 
        var retval = lineSegmentAnalyzer.analyzeDataset();
        if(!retval){
            console.log("Skipping linesegment analysis");
            return;
        }
        printOptions.printName = identifier;
        //Print non-grouped datased
        lineSegmentAnalyzer.printDataset(printOptions);
        //Sometimes occurences are grouped in neighberhood sectors, these get summarized by do grouping
        lineSegmentAnalyzer.doGrouping();  
        printOptions.printName = identifier+"Grouped";
        //Print groupted dataset with other name
        lineSegmentAnalyzer.printDataset(printOptions);
        //Delete local lines from memory
        lineSegmentAnalyzer.deleteSetOfLines();
    }
}


