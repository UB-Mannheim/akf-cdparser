/**
 * parser_tables.js
 * Parser functions for parsing content which is noted in tables
 * Some functions to get indices info from tables.
 * Some functions to create tables in a parsed form from html.
 * For parsing the modules 'cheerio' and 'cheerioparsedtables' are used.  
 */


var regLib              = require('./regexLib');
var cfw                 = require('./checkfileWriter');
var cheerio             = require('cheerio'); 
var cheeriotableparser  = require('cheerio-tableparser');
var regLib              = require('./regexLib');
var utils               = require('./utils');



/**
 * Parses an array of html-tables into an object which gives back the 
 * an array which indexes and identifies the strings which belong to a certain table
 * also gives a 'rest'-object which is everything which is not in these tables which contains
 * the index of the rest lines as key. 
 * @param {array of strings} linesWithTables input array which contains strings of html tables
 * @return {object} array with tables and rest
 */
function recognizeTableArrays(linesWithTables){
    var inTable=false;
    var tablesArr = [];
    var linesArr = []; //inner array for lines 
    var tablesIndex = 0;
    var rest ={};
    var infos = []; 
    function infoObject () {
        this.indexStart= null;
        this.indexStop= null;
    };
    var returnObject = {
        rest: null,         //rest of lines which not belong to tables 
        tablesArr: null,    //The recognized tables itself
        infos: null         //Contains additional informations about the table 
    }; 
    var currentInfoObject = null;

    for(var i=0;i<linesWithTables.length;i++){
        var currentline = linesWithTables[i];
        if(currentline.indexOf("<table")!=-1){
            //Table starts
            inTable = true;
            currentInfoObject = new infoObject();
            currentInfoObject.indexStart = i;
            linesArr.push(currentline);

        }else if(currentline.indexOf("</table")!=-1){
            //Table stops 
            inTable = false; 
            if(currentInfoObject==null){
                debugger;
                continue;
            }
            currentInfoObject.indexStop = i;
            linesArr.push(currentline);
            tablesArr.push(linesArr);
            infos.push(currentInfoObject);
            linesArr = []; //Refresh lines array for new table
        }else{
            if(inTable){
                linesArr.push(currentline);
            }else{
                rest[i] = currentline;
            }
        }
    }

    returnObject.tablesArr = tablesArr;
    returnObject.rest = rest;
    returnObject.infos = infos;
    return returnObject; 
}
/**
 * Create formatted tables objects with cheerio.js and cheeriotableparser 
 * for better interpretation, input is a tables line seperated array (html)
 * which can be obtained with 'recognizeTableArrays'.
 * 
 * @param {array of strings} tablesArr - input array which contains strings of html tables
 * @returns {array} - array of tables 
 */
function createParsedTables(tablesArr){
    var tablesParsed = []; 
    for(var i=0;i<tablesArr.length;i++){
        var  $ = cheerio.load(tablesArr[i].toString()); //this is too short 
        //var $ = cheerio.load(linesBeteiligungen);
        cheeriotableparser($);

        //Use the table parser
        //1st argument: false -> don't duplicate column values
        //2nd argument: false -> don't duplicate row values 
        //3rd argument: false  -> use textMode: 
        var data =  $("table").parsetable(false,false,false);
        tablesParsed.push(data);
    }
    return tablesParsed;
}


/**
 * Parse tables related to entwicklungs- and genußkapital
 * 
 * @param {array} tablesParsed - array of tables which contains the content  
 * @param {integer} entwicklungGenuskapitalIndex - index to find the content in the tablesParsedArray
 * @returns {array} - result with parsed items
 */
function parse_entwicklungGenusKapital(tablesParsed,entwicklungGenuskapitalIndex){
    var result_egk= [];
    //Get table with entwicklungs- and genußkapital content
    var table_egk = tablesParsed[entwicklungGenuskapitalIndex];
    if(!table_egk)debugger; 

    for(var i=0;i<table_egk[0].length;i++){
        var year; 
        var text; 

        //Check and assign year if there is one 
        if(table_egk[0] && table_egk[0][i]){
            var maybeYear =regLib.matchYear(utils.htmlText2Text(table_egk[0][i]));
            if(maybeYear && maybeYear.length>=1){
                year = maybeYear[0]; 
            }
        }
        //Check and assign text if there is one 
        if(table_egk[1] && table_egk[1][i]){
            var maybeText = utils.htmlText2Text(table_egk[1][i].trim()).trim();
            if(maybeText){
                text = maybeText;
            }   
        }
        //If text or year was assigned, create an object and push to result array
        if(year||text){
            var result = {};
            if(year) result.jahr = year;
            if(text) result.text = text; 
            result_egk.push(result);
        }
        
    }

    return result_egk;
}


/**
 * Parses the first array of tables parsed in to a kapitalentwicklung object
 * @param {array} tablesParsed 
 * @returns kapitalentwicklung
 */
function parse_kapitalEntwicklung(tablesParsed,tableKapitalEntw_index){
    var returnObjects = [];

    function subItemKapitalentwicklung(){
        this.art;
        this.betrag;
        this.text;
    }
    function objectKapitalentwicklung(){
        this.jahr;
        this.eintraege;
    }

    var cObject_kapitalEntw; 
    var table_kapitalEntwicklung = tablesParsed[tableKapitalEntw_index];
    if(!table_kapitalEntwicklung){
        debugger; //This shouldn't happen 
    }
    var currentSubitem = null;
    for(var i=0;i<table_kapitalEntwicklung[0].length;i++){
        var maybeYear = utils.htmlText2Text(table_kapitalEntwicklung[0][i]).trim();
        if(maybeYear!==""){            
            //This must be a year 
            var numMatch = regLib.matchNumber(maybeYear);
            if(numMatch && numMatch.length>=1){
                if(i>0){
                     returnObjects.push(cObject_kapitalEntw); //Push intermediate objects
                }
                //Push the last subitem from previous entry if there is one left 
                if(currentSubitem!=null && cObject_kapitalEntw){                   
                    if(!cObject_kapitalEntw.eintraege) cObject_kapitalEntw.eintraege=[];
                    cObject_kapitalEntw.eintraege.push(currentSubitem);  
                    currentSubitem=null;
                }   

                cObject_kapitalEntw = new objectKapitalentwicklung();
    
                cObject_kapitalEntw.jahr = utils.htmlText2Text(maybeYear);
            } 
        } 
        if(!cObject_kapitalEntw){
            continue;   //No valid first line found ... don't do other checks 
        }
        if(table_kapitalEntwicklung[1] && table_kapitalEntwicklung[1][i] 
            && table_kapitalEntwicklung[2] && table_kapitalEntwicklung[2][i]){

         
            try{
                var maybeArt =utils.htmlText2Text(table_kapitalEntwicklung[1][i]).trim();       
                if(maybeArt!==""){      
                    if(!cObject_kapitalEntw.eintraege) cObject_kapitalEntw.eintraege=[];
                    if(currentSubitem!=null)cObject_kapitalEntw.eintraege.push(currentSubitem);     

                    currentSubitem = new subItemKapitalentwicklung();
                    currentSubitem.art = maybeArt;
                
                    var maybeBetrag = utils.htmlText2Text(table_kapitalEntwicklung[2][i]);
                    if(maybeBetrag!==""){
                        currentSubitem.betrag = maybeBetrag;
                    }
                }
            }catch(e){
                debugger;
            }
        }
        if(table_kapitalEntwicklung[1] && table_kapitalEntwicklung[1][i]){
            var textMostLeft  = utils.htmlText2Text(table_kapitalEntwicklung[0][i]);
            var textMiddle    = utils.htmlText2Text(table_kapitalEntwicklung[1][i]);
            //Only if table_kapitalEntwicklung[2] is defined set textMostRight, otherwise it's just undefined
            var textMostRight = table_kapitalEntwicklung[2] ? utils.htmlText2Text(table_kapitalEntwicklung[2][i]):"";
            if(!textMostLeft && !textMostRight){
                if(currentSubitem==null)  currentSubitem = new subItemKapitalentwicklung();
                currentSubitem.text = textMiddle;
            }
        }
        /*
        if(table_kapitalEntwicklung[2] && table_kapitalEntwicklung[2][i]){
            var maybeBetrag =utils.htmlText2Text(table_kapitalEntwicklung[2][i]).trim();       
            if(maybeBetrag!==""){             
                cObject_kapitalEntw.betrag = maybeBetrag;
            }
        }
        */
    }

    if(currentSubitem!=null){
        if(!cObject_kapitalEntw.eintraege) cObject_kapitalEntw.eintraege=[];                
        cObject_kapitalEntw.eintraege.push(currentSubitem);
    }
    returnObjects.push(cObject_kapitalEntw); //Push the last object
    //Delete empty objects
    returnObjects = utils.removeEmptyEntriesFromArray(returnObjects);
    return returnObjects;
}

/**
 * Parse the tables which contain genehmigtes kapital
 * @param {array} tablesParsed - set of tables after parsing whith cheerio
 * @param {array} tablesArr - original tables array before parsing (contains also html-tags)
 * @param {object} rest - entries between the tables and their line indices
 * @param {object} infos - start and stop line-indices of the tables in 'tablesParsed'
 * @param {integer} genehmKapitalIndex - recognized index of genehmkapital-table in 'tablesParsed'
 * @param {integer} nextTableIndex - index for the next table with other content than genehmkapital
 * @param {array} substitutedKeys - sometimes there is just a headline followed by a not recognized table, this helps to recognize if sanitation was done in that case 
 * @returns {object} - genehmKapital parsed
 */
function parse_genehmKapital(tablesParsed,tablesArr,rest,infos,genehmKapitalIndex,nextTableIndex,substitutedKeys){
    //Check if index was substituted 
    var wasSubstituted = false; 
    if(substitutedKeys && substitutedKeys.length>=1){
        for(var key in substitutedKeys){
            var currentItem = substitutedKeys[key]; 
            if(currentItem==="genehmKapitalIndex"){
                wasSubstituted = true; 
            }
        }
    }

    var tableGenehmkapital = tablesParsed[genehmKapitalIndex];   //Table for 'Genehmigtes Kapital'
    if(!tableGenehmkapital){
        debugger; //Shouldn't happen
    }
    var returnobject = {}; 
    
    var genehmKapital = {
        betrag:null,
        bemerkung: "" 
    }
 
    //If the table has a valid header, check the table
    if(tableGenehmkapital &&
       (tableGenehmkapital[0][0].toLowerCase().indexOf("genehmigtes")!=-1||wasSubstituted)
    ){ 
        if(!tableGenehmkapital[1]){
            //Check the following table if it still contains content 
            var followUpIndex = genehmKapitalIndex+1;  
            if( followUpIndex<nextTableIndex ){
                //The next entry with recognized content is further away 
                var followUpTable = tablesParsed[followUpIndex];
                if(followUpTable && followUpTable[0]){
                    for(var i=0;i<followUpTable[0].length;i++){
                        var currentline = followUpTable[0][i];  
                        var clineText = utils.htmlText2Text(currentline).trim();
                        if(!clineText) continue;
                        genehmKapital.bemerkung = genehmKapital.bemerkung+" "+ clineText;

                    }
                }
            }
        }else{
            //parse data
            genehmKapital.betrag = utils.htmlText2Text(tableGenehmkapital[1][0]).trim();

            var starterIndex = wasSubstituted ? 0 : 1; //If the table was substituted start with 0 
            //If there are additional entries in the table 
            if(tableGenehmkapital[0] && tableGenehmkapital[0].length>1){
                for(var i=starterIndex;i<tableGenehmkapital[0].length;i++){
                    var tcontent = tableGenehmkapital[0][i];
                    //TODO: this can be less redundant 
                    if(!tcontent) continue;

                    var currentlines = tcontent.split("<br>");
                    for(var x=0;x<currentlines.length;x++){
                        var currentline = currentlines[x];  
                        var clineText = utils.htmlText2Text(currentline).trim();
                        if(!clineText) continue;
                        genehmKapital.bemerkung = genehmKapital.bemerkung+" "+ clineText;
                    }

                }
            }
        }
        //If there is a corresponding info object check - this means there is information, but it's not in the table directly
        if(infos[genehmKapitalIndex]){
            var restlines = getRestLines(infos[genehmKapitalIndex],rest,"<br>",infos[genehmKapitalIndex+1]);
            if(restlines && restlines.length){
                for(var i=0;i<restlines.length;i++){
                    var currentline = restlines[i].trim();
                    var clineText = utils.htmlText2Text(currentline);
                    if(!clineText) continue;
                    genehmKapital.bemerkung = genehmKapital.bemerkung+" "+ clineText;
                }
            }
        }
        
    }
    genehmKapital.bemerkung = genehmKapital.bemerkung.trim();

    if(genehmKapital.bemerkung !="" || genehmKapital.betrag !=null){
        returnobject.genehmKapital = genehmKapital;       
    }
    
    return returnobject;
}

/**
 * Parse the tables which contain bedingtes kapital
 * @param {array} tablesParsed - set of tables after parsing whith cheerio
 * @param {array} tablesArr - original tables array before parsing (contains also html-tags)
 * @param {object} rest - entries between the tables and their line indices
 * @param {object} infos - start and stop line-indices of the tables in 'tablesParsed'
 * @param {integer} bedingKapitalIndex - recognized index of related table in 'tablesParsed'
 * @param {integer} nextTableIndex - index for the next table with other content 
 * @returns {object} - parsed content 
 */
function parse_bedingKapital(tablesParsed,tablesArr,rest,infos,bedingKapitalIndex,nextTableIndex){
    var tableBedingkapital = tablesParsed[bedingKapitalIndex];   //Table for 'Genehmigtes Kapital'
    if(!tableBedingkapital){
        debugger; //Shouldn't happen
    }
    var returnobject = {}; 
    
    /**
     * Class holder for entry in returnobject
     */
    var bedingkapital = {
        betrag:null,
        eintraege: []
    }

    /**
     * Class holder for entry in 'eintraege' in bedingkapital object
     */
    function bkItem(){
        this.betrag_einzel = null;
        this.bemerkung = null;
    }

    //Remove empty entries from second table column, if column is completely empty remove  
    if(tableBedingkapital[1]){
        var temptable =utils.removeEmptyEntriesFromArray(tableBedingkapital[1]);        
        if(temptable.length==0){
            tableBedingkapital[1] = temptable;
        }//otherwise leave the table for entry consistency 
    }
    //If the table has a valid header, check the table
    if(tableBedingkapital && tableBedingkapital[0][0].toLowerCase().indexOf("bedingtes")!=-1){ 
        if(!tableBedingkapital[1] ||tableBedingkapital[1].length==0){
            //Check the following table if it still contains content 
            var followUpIndex = bedingKapitalIndex+1;  
            if( followUpIndex<nextTableIndex ){
                //The next entry with recognized content is further away 
                var followUpTable = tablesParsed[followUpIndex];
                if(followUpTable && followUpTable[0]){
                    for(var i=0;i<followUpTable[0].length;i++){
                        var currentline = followUpTable[0][i];  
                        var clineText = utils.htmlText2Text(currentline).trim();
                        if(!clineText) continue;
                        var bknew = new bkItem();
                        bknew.bemerkung = clineText; 
                        bedingkapital.eintraege.push(bknew);
                        //bedingkapital.bemerkung = bedingkapital.bemerkung+" "+ clineText;

                    }
                }
            }
        }else{
            //parse data
            bedingkapital.betrag = utils.htmlText2Text(tableBedingkapital[1][0]).trim();

            //If there are additional entries in the table 
            if(tableBedingkapital[0] && tableBedingkapital[0].length>1){
                for(var i=1;i<tableBedingkapital[0].length;i++){
                    var tcontent = tableBedingkapital[0][i];
                    //TODO: this can be less redundant 
                    if(!tcontent) continue;

                    var currentlines = tcontent.split("<br>");
                    for(var x=0;x<currentlines.length;x++){
                        var currentline = currentlines[x];  
                        var clineText = utils.htmlText2Text(currentline).trim();
                        if(!clineText) continue;
                        //bedingkapital.bemerkung = bedingkapital.bemerkung+" "+ clineText;
                        var bknew = new bkItem();
                        bknew.bemerkung = clineText.trim(); 
                        bedingkapital.eintraege.push(bknew);

                    }
                }
            }
        }
        //If there is a corresponding info object check - this means there is information, but it's not in the table directly
        if(infos[bedingKapitalIndex]){
            var restlines = getRestLines(infos[bedingKapitalIndex],rest,"<br>",infos[bedingKapitalIndex+1]);
            if(restlines && restlines.length){
                for(var i=0;i<restlines.length;i++){
                    var currentline = restlines[i].trim();
                    var clineText = utils.htmlText2Text(currentline);
                    if(!clineText) continue;
                    //bedingkapital.bemerkung = bedingkapital.bemerkung+" "+ clineText;
                    var bknew = new bkItem();
                    bknew.bemerkung = clineText.trim(); 
                    bedingkapital.eintraege.push(bknew);
                }
            }
        }
        
    }else{
        //The table has valid no header 
        for(var i=0;i<tableBedingkapital[0].length;i++){
            var currentItem = tableBedingkapital[0][i];
            if(currentItem){
                var currentItemSplit = currentItem.split("<br>");
                if(currentItemSplit.length==2){
                    var bknew = new bkItem();
                    
                    bknew.betrag_einzel = utils.htmlText2Text(currentItemSplit[0]).trim();
                    bknew.bemerkung = utils.htmlText2Text(currentItemSplit[1]).trim();
                    bedingkapital.eintraege.push(bknew);
                 
                }else{
                    if(currentItemSplit.length==1 && !currentItemSplit[0].trim()){
                        continue;
                    }
                }

            }
        }

    }

    returnobject.bedingkapital = bedingkapital;  

    return returnobject;
}


/**
 * Parse the tables which contain besondere bezugsrechte
 * @param {array} tablesParsed - set of tables after parsing whith cheerio
 * @param {array} tablesArr - original tables array before parsing (contains also html-tags)
 * @param {object} rest - entries between the tables and their line indices
 * @param {object} infos - start and stop line-indices of the tables in 'tablesParsed'
 * @param {integer} besBezugsrechteIndex - recognized index of related table in 'tablesParsed'
 * @param {integer} nextTableIndex - index for the next table with other content 
 * @returns {object} - parsed content 
 */
function parse_besBezugsrechte(tablesParsed,tablesArr,rest,infos,besBezugsrechteIndex,nextTableIndex){
    var tableBesondereBezugsrechte = tablesParsed[besBezugsrechteIndex];   //Table for 'Besondere Bezugsrechte'
    if(!tableBesondereBezugsrechte){
        debugger; //Shouldn't happen
    }
    var returnobject = {}; 
    
    var besBezugsrechte = {
        entries:[]
    }

    /**
     * Class holder for entry within besBezugsrechte
     */
    function entry(){
        this.jahr; 
        this.bemerkungen=[]; 
    }

    //If the table has a valid header, check the table
    if(tableBesondereBezugsrechte && tableBesondereBezugsrechte[0][0].toLowerCase().indexOf("besondere")!=-1){ 
        if(tableBesondereBezugsrechte[0].length<=1){ 
            //Check the following table if it still contains content 
            var followUpIndex = besBezugsrechteIndex+1;  
            if( followUpIndex<nextTableIndex ){
                //The next entry with recognized content is further away 
                var followUpTable = tablesParsed[followUpIndex];
                if(followUpTable && followUpTable[0]){
                    for(var i=0;i<followUpTable[0].length;i++){
                        
                        //Parse columns ..... 
                        var tcontent = followUpTable[0][i];
                        var tcontent2 = followUpTable[1][i];
                        //TODO: this can be less redundant 
                        if(tcontent){
                            var currentlines = tcontent.split("<br>");
                            for(var x=0;x<currentlines.length;x++){
                                var currentline = currentlines[x];  
                                var clineText = utils.htmlText2Text(currentline).trim();
                                if(!clineText) continue;
                                var currentEntry = new entry(); 
                                currentEntry.jahr = clineText; 
                                //Check the second table if there are additional remarks for that year 
                               if(tcontent2){
                                    var currentlines2 = tcontent2.split("<br>");
                                    for(var y=0;y<currentlines2.length;y++){
                                        var currentline = currentlines2[y];  
                                        var clineText = utils.htmlText2Text(currentline).trim();
                                        if(!clineText) continue;
                                        currentEntry.bemerkungen.push(clineText);
                                    }
                               }
                               besBezugsrechte.entries.push(currentEntry);
                            }
                        }
                    }
                }
            }
        }else{
            //If there are additional entries in the table 
            if(tableBesondereBezugsrechte[0] && tableBesondereBezugsrechte[0].length>1){
                for(var i=1;i<tableBesondereBezugsrechte[0].length;i++){
                    //Parse column one ..... 
                    var tcontent = tableBesondereBezugsrechte[0][i];
                    var tcontent2 = tableBesondereBezugsrechte[1][i];
                    if(tcontent){
                        var currentlines = tcontent.split("<br>");
                        for(var x=0;x<currentlines.length;x++){
                            var currentline = currentlines[x];  
                            var clineText = utils.htmlText2Text(currentline).trim();
                            if(!clineText) continue;
                            var currentEntry = new entry(); 
                            currentEntry.jahr = clineText; 
                            //Check the second table if there are additional remarks for that year 
                           if(tcontent2){
                                var currentlines2 = tcontent2.split("<br>");
                                for(var y=0;y<currentlines2.length;y++){
                                    var currentline = currentlines2[y];  
                                    var clineText = utils.htmlText2Text(currentline).trim();
                                    if(!clineText) continue;
                                    currentEntry.bemerkungen.push(clineText);
                                }
                           }
                           besBezugsrechte.entries.push(currentEntry);
                        }
                    }
                }
            }
        }
        //If there is a corresponding info object check - this means there is information, but it's not in the table directly
        if(infos[besBezugsrechteIndex]){ //TODO really necessary here ? 
            var restlines = getRestLines(infos[besBezugsrechteIndex],rest,"<br>",infos[besBezugsrechteIndex+1]);
            if(restlines && restlines.length){
                for(var i=0;i<restlines.length;i++){
                    var currentline = restlines[i].trim();
                    var clineText = utils.htmlText2Text(currentline).trim();
                    if(!clineText) continue;
                    besBezugsrechte.bemerkungen.push(clineText);
                }
            }
        }
        
    }
 
    if(besBezugsrechte.entries.length >=1 ){
        returnobject.besBezugsrechte = besBezugsrechte.entries;       
    }
    
    return returnobject;
}

/**
 * Parse the tables which contain ermächtigung aktienerwerb
 * @param {array} tablesParsed - set of tables after parsing whith cheerio
 * @param {array} tablesArr - original tables array before parsing (contains also html-tags)
 * @param {object} rest - entries between the tables and their line indices
 * @param {object} infos - start and stop line-indices of the tables in 'tablesParsed'
 * @param {integer} ermaechtigungAktienErwerbIndex - recognized index of related table in 'tablesParsed'
 * @param {integer} nextTableIndex - index for the next table with other content 
 * @returns {object} - parsed content 
 */
function parse_ermAktienerwerb(tablesParsed,tablesArr,rest,infos,ermaechtigungAktienErwerbIndex,nextTableIndex){
    var tableAktienerwerb = tablesParsed[ermaechtigungAktienErwerbIndex];   //Table for 'Ermächtigung Aktienerwerb'
    if(!tableAktienerwerb){
        debugger; //Shouldn't happen
    }
    var returnobject = {}; 
    
    var ermAktienerwerb = {
        text:[]
    }

    var firstlineText = utils.htmlText2Text(tableAktienerwerb[0][0]);
    //If the table has a valid header, check the table
    if(tableAktienerwerb && firstlineText.toLowerCase().indexOf("ermächtigung")!=-1){ 
        if(tableAktienerwerb[0].length<=1){ 
            //Check the following table if it still contains content 
            var followUpIndex = ermaechtigungAktienErwerbIndex+1;  
            if( followUpIndex<nextTableIndex ){
                //The next entry with recognized content is further away 
                var followUpTable = tablesParsed[followUpIndex];
                if(followUpTable && followUpTable[0]){
                    for(var i=0;i<followUpTable[0].length;i++){
                        //Parse column one ..... 
                        var tcontent = followUpTable[0][i];
                        //TODO: this can be less redundant 
                        if(tcontent){
                            var currentlines = tcontent.split("<br>");
                            for(var x=0;x<currentlines.length;x++){
                                var currentline = currentlines[x];  
                                var clineText = utils.htmlText2Text(currentline).trim();
                                if(!clineText) continue;
                                ermAktienerwerb.text.push(clineText);
                            }
                        }
                    }
                }
            }
        }else{
            //If there are additional entries in the table 
            if(tableAktienerwerb[0] && tableAktienerwerb[0].length>1){
                for(var i=1;i<tableAktienerwerb[0].length;i++){
                    //Parse column one ..... 
                    var tcontent = tableAktienerwerb[0][i];
                    //TODO: this can be less redundant 
                    if(tcontent){
                        var currentlines = tcontent.split("<br>");
                        for(var x=0;x<currentlines.length;x++){
                            var currentline = currentlines[x];  
                            var clineText = utils.htmlText2Text(currentline).trim();
                            if(!clineText) continue;
                            ermAktienerwerb.text.push(clineText);
                        }
                    }
                }
            }
        }
        //If there is a corresponding info object check - this means there is information, but it's not in the table directly
        if(infos[ermaechtigungAktienErwerbIndex]){ //TODO really necessary here ? 
            var restlines = getRestLines(infos[ermaechtigungAktienErwerbIndex],rest,"<br>",infos[ermaechtigungAktienErwerbIndex+1]);
            if(restlines && restlines.length){
                for(var i=0;i<restlines.length;i++){
                    var currentline = restlines[i].trim();
                    var clineText = utils.htmlText2Text(currentline).trim();
                    if(!clineText) continue;
                    ermAktienerwerb.text.push(clineText);
                }
            }
        }
        
    }
 
    if( ermAktienerwerb.text.length >=1){
        returnobject = ermAktienerwerb;       
    }
    
    return returnobject;
}

/**
 * Parse the tables which contain grundkapital, also for stückelung and stimmrecht
 * @param {array} tablesParsed - set of tables after parsing whith cheerio
 * @param {array} tablesArr - original tables array before parsing (contains also html-tags)
 * @param {object} rest - entries between the tables and their line indices
 * @param {object} infos - start and stop line-indices of the tables in 'tablesParsed'
 * @param {integer} tableGrundkapitalIndex - recognized index of related table in 'tablesParsed'
 * @param {string} headline (default: "grundkapital") - the identifier for the first item in the table
 * @returns {object} - parsed content 
 */
function parse_grundkapital(tablesParsed,tablesArr,rest,infos,tableGrundkapitalIndex,headline="grundkapital"){
    var tableGrundkapital = tablesParsed[tableGrundkapitalIndex];
     
    var returnobject = {}; 

    //Returnobject for grundkapital
    var grundkapital = {
        betrag:null,
        bemerkungen: [] 
    }

    //Other objects for stückelung and stimmrecht
    var stückelung =[]; 
    var stimmrecht =[];

    //If the table has a valid header, check the table
    if(tableGrundkapital && tableGrundkapital[0][0].toLowerCase().indexOf(headline)!=-1){ 
        //parse data
        grundkapital.betrag = utils.htmlText2Text(tableGrundkapital[1][0]);

        var currentBemerkung = [];
        //If there are additional entries in the table 
        if(tableGrundkapital[0] && tableGrundkapital[0].length>1){
            for(var i=1;i<tableGrundkapital[0].length;i++){
                var tcontent = tableGrundkapital[0][i];
                //TODO: this can be less redundant 
                if(!tcontent) continue;
                
                var currentlines = tcontent.split("<br>");
                for(var x=0;x<currentlines.length;x++){
                    var currentline = currentlines[x];  
                    var clineText = utils.htmlText2Text(currentline);
                    
                    var foundStueckelungOrStimmrecht = false; 
                    var maybeStückelung = getStückelung(clineText);  
                    if(maybeStückelung){ //if stückelung is found...assign
                        stückelung.push(maybeStückelung);
                        foundStueckelungOrStimmrecht = true; 
            
                    }
                    if(!foundStueckelungOrStimmrecht){
                        var maybeStimmrecht = getStimmrecht(clineText);
                        if(maybeStimmrecht){
                            stimmrecht.push(maybeStimmrecht);
                            continue;
                            foundStueckelungOrStimmrecht = true;
                        }
                    }

                    if(foundStueckelungOrStimmrecht){
                        //Push a accumulated bemerkung
                        grundkapital.bemerkungen.push(currentBemerkung);
                        currentBemerkung = []; //Create a new array 
                    }else{
                        //Accumulate bemerkung 
                        currentBemerkung.push(clineText.trim());
                    }
                }

            }
        }

        //Push last accumulated bemerkung 
        if(currentBemerkung && currentBemerkung.length>=1){
            grundkapital.bemerkungen.push(currentBemerkung);
           
        }
        currentBemerkung = [];

        //If there is a corresponding info object check - this means there is information, but it's not in the table directly
        if(infos[tableGrundkapitalIndex]){
            var restlines = getRestLines(infos[tableGrundkapitalIndex],rest,"<br>",infos[tableGrundkapitalIndex+1]);
            if(restlines && restlines.length){
                for(var i=0;i<restlines.length;i++){
                    var currentline = restlines[i].trim();
                    var clineText = utils.htmlText2Text(currentline);

                    if(!clineText) continue;

                    var foundStueckelungOrStimmrecht = false; 
                    var maybeStückelung = getStückelung(clineText);  
                    if(maybeStückelung){ //if stückelung is found...assign
                        stückelung.push(maybeStückelung);
                        foundStueckelungOrStimmrecht = true; 
            
                    }
                    if(!foundStueckelungOrStimmrecht){
                        var maybeStimmrecht = getStimmrecht(clineText);
                        if(maybeStimmrecht){
                            stimmrecht.push(maybeStimmrecht);
                            continue;
                            foundStueckelungOrStimmrecht = true;
                        }
                    }

                    if(foundStueckelungOrStimmrecht){
                        //Push a accumulated bemerkung
                        grundkapital.bemerkungen.push(currentBemerkung);
                        currentBemerkung = []; //Create a new array 
                    }else{
                        //Accumulate bemerkung 
                        currentBemerkung.push(clineText.trim());
                    }
                }
            }
        }
    }

   //If there were entries defined, push them to the corresponding returnobject property
    if(currentBemerkung && currentBemerkung.length>=1){
        grundkapital.bemerkungen.push(currentBemerkung);       
    }

    if(grundkapital.bemerkung !="" || grundkapital.betrag !=null){
        returnobject.grundkapital = grundkapital;       
    }

    if(stimmrecht) returnobject.stimmrecht = stimmrecht;
    if(stückelung) returnobject.stückelung = stückelung;
    
    return returnobject;
}

/**
 * Parse the tables which contain bereinigte kurse 
 * @param {array} tablesParsed - set of tables after parsing whith cheerio
 * @param {array} tablesArr - original tables array before parsing (contains also html-tags)
 * @param {object} rest - entries between the tables and their line indices
 * @param {object} infos - start and stop line-indices of the tables in 'tablesParsed'
 * @param {integer} callnumber - indicates how often this function was called for one file
 * @returns {object} - parsed content 
 */
function parse_bereinigtekurse(tablesParsed,tablesArr,rest,infos,callnumber){
    if(!tablesParsed ||tablesParsed.length>1){
        debugger; //check what's going on
    }
    var tableBereinigteKurse = tablesParsed[0];

    function kursitem(){ };

    //Row indices of which assign values to kursitem variables, 
    //these are assigned by parsing the first column in the array 
    function itemIndices(){
        this.jahr=-1;
        this.kommentar=-1;
        this.hoechst= -1;
        this.tiefst= -1;
        this.ultimo= -1;
        this.assignPossibleKommentar = function(){
            if(this.jahr+1 != this.hoechst){
                this.kommentar = this.jahr+1;
            }
        }
    };

    //Sometimes a set of tables contains multiple rows with repeating content, but other indices
    //to get all indices correctly ItemIndices are stored in this group array
    var itemIndicesGroups =[];
      
    var returnObject = {
        kurse: [],
        notiz_bereinigteKurse: null
    }; 
    
    //Save header as notiz 
    var headerSplit = utils.htmlText2Text(rest[0]).split("Bereinigte Kurse");
    
    if(!headerSplit){
        debugger;
    }else if(headerSplit.length==1){       
       returnObject.notiz_bereinigteKurse = regLib.removeParenthesis(headerSplit[0]).replace("Kurse","").trim();
    }else{
       returnObject.notiz_bereinigteKurse = regLib.removeParenthesis(headerSplit[1]).trim();
    }

    //Parse tables
    for(var s=0;s<tablesParsed.length;s++){
        var tableBereinigteKurse = tablesParsed[s];
        for(var i=0;i<tableBereinigteKurse.length;i++){
            var currentColumn = tableBereinigteKurse[i];
            var nextColumn    = tableBereinigteKurse[i+1];

            if(i==0){
                var currentItemIndices = new itemIndices();
                //Assign the item indices
                for(var x=0;x<currentColumn.length;x++){
                    //If there is a double definition of one entry the array gets reset
                    var currentItem = currentColumn[x];
                    var nextItem;
                    if(nextColumn){
                        nextItem = nextColumn[x];
                    }
                    var currentItemTextLC = utils.htmlText2Text(currentItem).trim().toLowerCase();
                    if(currentItem.indexOf("</b>")!=-1){ //first recognition type for year
                        if(currentItemIndices.jahr!=-1){
                            currentItemIndices.assignPossibleKommentar();
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();    
                        }  
                        currentItemIndices.jahr = x;
                    }else if( nextItem && nextItem.indexOf("</b>")!=-1){ //other recognition type for year
                        var nextItemTextLC = utils.htmlText2Text(nextItem).trim().toLowerCase();
                        if(currentItemIndices.jahr!=-1){
                            currentItemIndices.assignPossibleKommentar();
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();    
                        }  
                        currentItemIndices.jahr = x;
                    //Parse other items which contain other specific headers
                    }else if(currentItemTextLC ==="höchst"){
                        if(currentItemIndices.hoechst!=-1){
                            currentItemIndices.assignPossibleKommentar();
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();
                        }
                        currentItemIndices.hoechst = x;
                    }else if(currentItemTextLC ==="tiefst"){
                        if(currentItemIndices.tiefst!=-1){
                            currentItemIndices.assignPossibleKommentar();
                            itemIndicesGroups.push(currentItemIndices);                        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.tiefst = x;
                    }else if(currentItemTextLC ==="ultimo"){
                        if(currentItemIndices.ultimo!=-1){
                            currentItemIndices.assignPossibleKommentar();
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.ultimo = x;
                    }
                    //Index position 5 or 6 as indicator for new line 

                }
                
                currentItemIndices.assignPossibleKommentar();
                itemIndicesGroups.push(currentItemIndices);
            }else{ 
                //Get column content an push content to returnobject
                if( itemIndicesGroups.length>=2
                    && itemIndicesGroups[0].jahr!=-1 && itemIndicesGroups[1].jahr!=-1
                    && itemIndicesGroups[0].jahr != itemIndicesGroups[1].jahr){
                        
                    for(var ing=0;ing<itemIndicesGroups.length;ing++){
                        //Create multiple items fixes an issue with same table but different years here
                        var arrayk = [itemIndicesGroups[ing]]; 
                        var filledItemp = parseColumnContentToItem(currentColumn,arrayk);
                        returnObject = pushItemToReturnObject("kurse",filledItemp,returnObject,i);
                    }                  
                }else{
                    //The values get assigned to the indices here 
                    var filledItem = parseColumnContentToItem(currentColumn,itemIndicesGroups);
                    //Push the values to returnobject 
                    returnObject = pushItemToReturnObject("kurse",filledItem,returnObject,i);
                }
            }
        }
    }

    returnObject.kurse = utils.removeEmptyEntriesFromArray(returnObject.kurse);
    if(utils.isObjectEmpty(returnObject.notiz_bereinigteKurse)) delete returnObject.notiz_bereinigteKurse  
    
    //Create a boersenbewertung object corresponding to callnumber and return it.
    var key = "boersenbewertung"+callnumber;
    var realReturnObject = {
        [key]: returnObject
    }    
    return realReturnObject;
}


/**
 * Parse the tables which contain ausgegebenes kapital 
 * @param {array} tablesParsed - set of tables after parsing whith cheerio
 * @param {array} tablesArr - original tables array before parsing (contains also html-tags)
 * @param {object} rest - entries between the tables and their line indices
 * @param {object} infos - start and stop line-indices of the tables in 'tablesParsed'
 * @param {integer} tableGrundkapitalIndex - obsolete and not used here TODO: remove this
 * @returns {object} - parsed content 
 */
function parse_ausgegebenesKapital(tablesParsed,tablesArr,rest,infos,tableGrundkapitalIndex){
   
    var ausgegebenesKapital = {
        eintraege:[]
    }

    /**
     * Holder class for an entry in ausgegebenesKapital returnObject
     */
    function eintrag () {
        this.betrag; 
        this.notiz;
        this.stueckelung;
        this.stimmrecht;
    }

    var tableAusgegebenesKapital; 
    //If only one table,- take the first one, otherwise detect table ausgegebenes kapital
    if(tablesParsed && tablesParsed.length==1){
        tableAusgegebenesKapital= tablesParsed[0]; 
    }else{
        //Detect the table ausgegebenes kapital
        for(var i=0;i<tablesParsed.length;i++){
            var currentTable = tablesParsed[i];
            for(var x=0; x<currentTable.length;x++){
                var curColumn = currentTable[x];
                var firstItem  = curColumn[0];
                if(firstItem.indexOf("b>Ausgegebenes Kapital")){
                    tableAusgegebenesKapital= currentTable;
                    i = tablesParsed.length+1; //Leave the outer loop                  
                    break; 
          
                }
            }
        }        
    }

    //Iterate rows of first item
    for(var i=0;i<tableAusgegebenesKapital[0].length;i++){
        var item_col1 = tableAusgegebenesKapital[0][i];
        var item_col2 = tableAusgegebenesKapital[1][i];
        var item_col1Txt = utils.htmlText2Text(item_col1);
        var item_col2Txt = utils.htmlText2Text(item_col2);        
        var col2_nrMatch = regLib.matchNumber(item_col2Txt);

        var newEintrag = new eintrag(); 
        if(col2_nrMatch){
            newEintrag.betrag = item_col2Txt;
        }
        if(item_col1.toLowerCase().indexOf("ausgegebenes kapital")!=-1){
            newEintrag.notiz  = item_col1Txt;            
        }else{
            var stimmrecht = getStimmrecht(item_col1Txt,true); 
            var stueckelung = getStückelung(item_col1Txt,true); //Doesn't work correctly -> Cutout rest 
            var notizRest = item_col1Txt;
            if(stimmrecht){
                newEintrag.stimmrecht = stimmrecht;
                notizRest = notizRest.replace(stimmrecht,"").replace("Stimmrecht:","");
                
            }
            if(stueckelung){
                newEintrag.stueckelung = stueckelung; 
                notizRest = notizRest.replace(stueckelung,"").replace("Stückelung:","");
            }

            newEintrag.notiz = notizRest.trim(); 
        }
        if(!utils.isObjectEmpty(newEintrag)){
            ausgegebenesKapital.eintraege.push(newEintrag);            
        }
    }
    //Check the rest for stückelung and stimmrecht 
    for(var key in rest){
        if(!rest.hasOwnProperty(key))continue;
        var currentRest     = rest[key];
        var currentRestHTML = utils.htmlText2Text(rest[key]);
        if(currentRestHTML){
            var tailEintrag = new eintrag();             
            var currentRestSplit = currentRest.split("<br>");
            for(var i=0;i<currentRestSplit.length;i++){
                var restChunk = currentRestSplit[i];
                var stimmrecht = getStimmrecht(restChunk,true); 
                var stueckelung = getStückelung(restChunk,true); //Doesn't work correctly -> Cutout rest 
                if(stimmrecht){
                    tailEintrag.stimmrecht = stimmrecht;
                }
                if(stueckelung){
                    tailEintrag.stueckelung = stueckelung;
                }
            }
            if(tailEintrag.stueckelung||tailEintrag.stimmrecht){
                ausgegebenesKapital.eintraege.push(tailEintrag);               
            }

        }
    }

    return ausgegebenesKapital;
}


/**
 * Parse the tables which contain dividenden 
 * TODO: this is parsed with static row headers- consider to use dynamic row headers like in many other items
 * @param {array} tablesParsed - set of tables after parsing whith cheerio
 * @param {array} tablesArr - original tables array before parsing (contains also html-tags)
 * @param {object} rest - entries between the tables and their line indices
 * @param {object} infos - start and stop line-indices of the tables in 'tablesParsed'
 * @param {integer} callnumber - indicates how often this function was called for one file
 * @returns {object} - parsed content 
 */
function parse_dividenden(tablesParsed,tablesArr,rest,infos,callnumber){
    //Row indices of which assign values to variables, 
    //these are assigned by parsing the first column in the array 
    function itemIndices(){
        this.jahr=-1;
        this.dividende=-1;
        this.bonus= -1;
        this.sonderausschuettung= -1;
        this.steuerguthaben= -1;
        this.divscheinnr= -1;
        this.extag = -1;
        this.kupon_nr = -1;
    };

    
    var returnObject = {
        dividenden: [],
        dividenden_notiz: null,
        dividenden_bemerkungen:[]
    }; 
    
    //Parse header content to notiz
    var headerSplit = utils.htmlText2Text(rest[0]).replace("/Ausschüttung","").split("Dividenden");
    
    if(!headerSplit){
        debugger;
    }else if(headerSplit.length==1){       
        returnObject.dividenden_notiz = regLib.removeParenthesis(headerSplit[0]).replace("Kurse","").trim();
    }else{
        returnObject.dividenden_notiz = regLib.removeParenthesis(headerSplit[1]).trim();
    }

    //Go through tables 
    for(var s=0;s<tablesParsed.length;s++){
        var tableDividenden = tablesParsed[s];

        /**
         * Sometimes a set of tables contains multiple rows with repeating content, but other indices
         * to get all indices correctly ItemIndices are stored in this group array
         */
        var itemIndicesGroups =[];

        for(var i=0;i<tableDividenden.length;i++){
            var currentColumn = tableDividenden[i];
            var nextColumn    = tableDividenden[i+1];
            if(i==0){
                var currentItemIndices = new itemIndices();
                //Assign the item indices
                for(var x=0;x<currentColumn.length;x++){
                    //If there is a double definition of one entry the array gets reset
                    var currentItem = currentColumn[x];
                    var nextItem;
                    if(nextColumn){
                        nextItem = nextColumn[x];
                    }
                    //Detect year or subcategories and assign to indices
                    var currentItemTextLC = utils.htmlText2Text(currentItem).trim().toLowerCase();
                    if(currentItem.indexOf("</b>")!=-1){ //first recognition type for year
                        if(currentItemIndices.jahr!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();    
                        }  
                        currentItemIndices.jahr = x;
                    }else if( nextItem && nextItem.indexOf("</b>")!=-1){
                        var nextItemTextLC = utils.htmlText2Text(nextItem).trim().toLowerCase();
                        if(currentItemIndices.jahr!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();    
                        }  
                        currentItemIndices.jahr = x;
                    }else if(currentItemTextLC ==="dividende" || currentItemTextLC ==="ausschüttung"){
                        if(currentItemIndices.dividende!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();
                        }
                        currentItemIndices.dividende = x;
                    }else if(currentItemTextLC ==="bonus"){
                        if(currentItemIndices.bonus!=-1){
                            itemIndicesGroups.push(currentItemIndices);                        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.bonus = x;
                    }else if(currentItemTextLC ==="sonderausschüttung"){
                        if(currentItemIndices.sonderausschuettung!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.sonderausschuettung = x;
                    }else if(currentItemTextLC ==="bonus"){
                        if(currentItemIndices.bonus!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.bonus = x;
                    }else if(currentItemTextLC ==="ex-tag"){
                        if(currentItemIndices.extag!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.extag = x;
                    }else if(currentItemTextLC ==="div.-schein-nr." || currentItemTextLC =="aussch.-ant.-schein-nr."){
                        if(currentItemIndices.divscheinnr!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.divscheinnr = x;

                    }else if(currentItemTextLC.indexOf("kupon-nr")!=-1){
                        if(currentItemIndices.kupon_nr!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.kupon_nr = x;

                    }else if(currentItemTextLC ==="steuerguthaben"||currentItemTextLC ==="st. guthaben"){
                        if(currentItemIndices.steuerguthaben!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.steuerguthaben = x;
                    }else if(currentItem.indexOf("sup")!=-1){
                        var currentItemSplit = currentItem.split("<br>");
                        for(var xy=0;xy<currentItemSplit.length;xy++){
                            var item = currentItemSplit[xy];
                            var itemText = utils.htmlText2Text(item);
                            returnObject.dividenden_bemerkungen.push(itemText);               
                        }
                    }
                    //Index position 5 or 6 as indicator for new line - 
                }
                
                itemIndicesGroups.push(currentItemIndices);
            }else{ 
                //The values get assigned to the indices here 
                var filledItem = parseColumnContentToItem(currentColumn,itemIndicesGroups);
                //Push the values to returnobject 
                returnObject = pushItemToReturnObject("dividenden",filledItem,returnObject,i);
            }  
        }
    }


    returnObject.dividenden = utils.removeEmptyEntriesFromArray(returnObject.dividenden);
    
    //If there is some stuff in rest, which is not only html, push it to bemerkungen.
    for(var key in rest){
        if(rest.hasOwnProperty(key)){
            //add the rest to 'bemerkungen'
            if(rest[key].indexOf("<b>Dividenden")==-1 && rest[key].indexOf("________")==-1){
                var clearBemerkung = utils.htmlText2Text(rest[key]).trim();
                if(clearBemerkung){
                    returnObject.dividenden_bemerkungen.push(clearBemerkung);
                }
            }
        }
    }


    if(utils.isObjectEmpty(returnObject.dividenden_notiz)) delete returnObject.dividenden_notiz ; 
    if(returnObject.dividenden_bemerkungen.length==0) delete returnObject.dividenden_bemerkungen;
    var key = "boersenbewertung"+callnumber;
    var realReturnObject = {
        [key]: returnObject
    }
    return realReturnObject;
}

/**
 * Helper function for parse_Kennzahlen. Helps to detect an index in rest. 
 * @param {integer} index current table index 
 * @param {object} infos contains the info about start and stop indices of the tables
 * @param {object} rest  contains information which can occasionally be between some tables 
 */
function detectAdditionalHeadline(index,infos,rest){
    //Edge case: detect if there is a headline in a rest between the two tables 
    var restHeadline="";
    var currentInfo = infos[index-1];
    var nextInfo = infos[index];
    var headlinesFound = [];
    if(currentInfo && nextInfo){
        var istart = currentInfo.indexStop+1; 
        var istop = nextInfo.indexStart;
        for(var n=istart;n<istop;n++){
            if(rest[n]){
                if(rest[n].indexOf("<b>")!=-1 && rest[n].indexOf("</b")!=-1){                      
                    headlinesFound.push(rest[n]);
                }
            }
        }
    }
    if(headlinesFound.length>=2)debugger; 
    var foundHeadline = headlinesFound.length>=1 ? utils.htmlText2Text(headlinesFound[0]):""; 
    return foundHeadline;
}

/* 
 * Parse ergebnisabführung
 * @param {array} tablesParsed - set of tables after parsing whith cheerio
 * @param {array} tablesArr - original tables array before parsing (contains also html-tags)
 * @param {object} rest - entries between the tables and their line indices
 * @param {object} infos - start and stop line-indices of the tables in 'tablesParsed'
 * @param {integer} callnumber - indicates how often this function was called for one file
 * @param {boolean} mode - false not recursively called normal parsing, true: recursively called parsing is different
 * @returns {object} - object which is filled
 */
function parse_ergebnisabfuehrung(tablesParsed,tablesArr,rest,infos,callnumber,mode){
    var returnObject =[];
    var tableEAF= tablesParsed[0];
    if(!tableEAF)return returnObject;
    
    function entry(){
        this.jahr ="";
        this.betrag="";
    };

    if(!mode){
        for(var i=0;i<tableEAF[0].length;i++){
            var currentEntry = new entry(); 
            //Parse Column 1 
            if(tableEAF[0][i]){
                var column1Text = utils.htmlText2Text(tableEAF[0][i]).trim();
                var maybeYear = regLib.matchYear(column1Text);
                if(maybeYear && maybeYear.length>=1){
                    currentEntry.jahr = column1Text;
                }
            }


            //Parse Column 2 
            if(tableEAF[1][i]){
                var column2Text = utils.htmlText2Text(tableEAF[1][i]).trim();
                if(column2Text){
                    currentEntry.betrag = column2Text;
                }
            }
            if(currentEntry.jahr ||currentEntry.betrag){
                returnObject.push(currentEntry);
            }
        }
    }else{
        //Assign indices to entry
        for(var i=0;i<tableEAF.length;i++){
            var currentEntry = new entry(); 
            var currentColumn = tableEAF[i];
            var firstItem = utils.htmlText2Text(currentColumn[0]).trim();
            if(firstItem){
                var maybeYear = regLib.matchYear(firstItem); 
                if(maybeYear && maybeYear.length>=1){
                    currentEntry.jahr = firstItem;
                }
            }
            var secondItem = utils.htmlText2Text(currentColumn[1]).trim(); 
            if(secondItem && secondItem.indexOf("Ergebnisabführung")==-1){
                currentEntry.betrag = secondItem;
            }
            if(currentEntry.jahr ||currentEntry.betrag){
                returnObject.push(currentEntry);
            }
        }
    }
    var realReturnObject = {};
    realReturnObject.ergebnisabfuehrung = returnObject;
    return realReturnObject;
}


/* 
 * Parse kennzahlen
 * @param {array} tablesParsed - set of tables after parsing whith cheerio
 * @param {array} tablesArr - original tables array before parsing (contains also html-tags)
 * @param {object} rest - entries between the tables and their line indices
 * @param {object} infos - start and stop line-indices of the tables in 'tablesParsed'
 * @param {integer} callnumber - indicates how often this function was called for one file
 * @returns {object} - object which is filled
 */
function parse_kennzahlen(tablesParsed,tablesArr,rest,infos,callnumber){

    //Row indices of which assign values to  variables, 
    //these are assigned by parsing the first column in the array 
    /* Legacy code: non-dynamic index assignment
    function itemIndices(){
        this.kopfzeile =-1; //Can be Kennzahlen der Erträge
        this.jahr=-1;
        this.konzern = {
            investitionen:-1,
            jahresueberschuss: -1,
            gesamtueberschuss: -1,
            bilanzkurs: -1,
            eigenkapitalquote: -1,
            bilanzsumme: -1,
            anlagevermoegen: -1,
            eigenkapital: -1,
            umsatzerlaesse: -1,
            teilbetriebsergebnis: -1,
            geschaeftsvolumen: -1
        }
        this.beschaeftigte = {
            durchschnitt: -1,
            gj_ende: -1
        }
        this.umsatzsegmente = {
            strom: -1,
            uebertragung: -1,
            sonstiges: -1,
            gesamt: -1
        }
    };
    */
    function itemIndices(){
        this.kopfzeile =-1; //Can be Kennzahlen der Erträge
        this.jahr=-1;
    };
    //Additional information about kennahlen 
    function infoObject (){ 
        this.name = "";
        this.waehrung = ""; //Common entry for waehrung
        this.eintraege = [];
    };

    //Holder class for element of waehrungsinfo 
    function waehrungsEintrag(){
        this.name ="";
        this.waehrung="";
        this.index =-1;
    };

    var returnObject = {
        kennzahlen:{},
        waehrungsinfo: [],
        notizen: []
    }; 
    //Find the additional information in Headerline 
    for(key in rest){
        if(rest.hasOwnProperty(key)){
            var currentRest = utils.htmlText2Text(rest[key]);
            if(currentRest && currentRest.indexOf("Kennzahlen")!=-1){
                var headline = utils.htmlText2Text(currentRest).replace("Kennzahlen","");
                var matchPar = regLib.matchBetweenParenthesis(headline);
                if(matchPar && matchPar[0]){
                    debugger;
                    returnObject.notizen.push(matchPar[0]);
                }               
            }else{
                returnObject.notizen.push(currentRest);
            }
        }
    }
    //Go through tables 
    for(var s=0;s<tablesParsed.length;s++){
        var tableKennzahlen = tablesParsed[s];
        var itemIndicesGroups =[];
        var occurrenceCounterGroups =[]; //Counts the occurences of item indices 

        var foundHeadline = detectAdditionalHeadline(s,infos,rest);
        var pushCtr=-1;

        for(var i=0;i<tableKennzahlen.length;i++){            
            var currentColumn = tableKennzahlen[i];
            var nextColumn    = tableKennzahlen[i+1];
            var cInfo = new infoObject();
            //Increment the number of pushed objects, if the current item fits standard to be pushed
            if(currentColumn[0] && utils.htmlText2Text(currentColumn[0]).trim()
                ||currentColumn[1] && utils.htmlText2Text(currentColumn[1]).trim()){
                pushCtr = pushCtr +1;
            }
            if(i==0){            
                var currentItemIndices = new itemIndices();
                var currentOccurenceCount = new itemIndices(); //Count the occurence of items to get an indexing for redundant entries
                //Assign the item indices
                for(var x=0;x<currentColumn.length;x++){
                    //If there is a double definition of one entry the array gets reset
                    var currentItem = currentColumn[x];
                    var nextItem;
                    if(nextColumn){
                        nextItem = nextColumn[x];
                    }
                    var currentItemText = utils.htmlText2Text(currentItem).trim()
                    var currentItemTextLC = currentItemText.toLowerCase();
                    if(foundHeadline){
                        if(currentItemIndices.kopfzeile!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();    
                        }  
                        currentItemIndices.kopfzeile = foundHeadline.replace(/,/g,"");
                        //Create an Info Object for Weahrungsinfo 
                        cInfo = new infoObject();
                        cInfo.name = currentItemIndices.kopfzeile.trim();
                        var parMatch = regLib.matchBetweenParenthesis(cInfo.name);
                        if(parMatch && parMatch.length>=1){
                            cInfo.waehrung = regLib.removeParenthesis(parMatch[0]);
                        }
                        returnObject.waehrungsinfo.push(cInfo);
                        foundHeadline="";
                        x=x-1; //Just go again trhough this line
                        continue;

                    }else if(currentItem.indexOf("<b>")!=-1 && currentItem.indexOf("</b>")!=-1){
                        if(currentItemIndices.kopfzeile!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();    
                        }  
                        currentItemIndices.kopfzeile = currentItemText.replace(/,/g,"");
                        currentItemIndices.jahr = x;
                        //Create an Info Object for Weahrungsinfo 
                        cInfo = new infoObject();
                        cInfo.name = currentItemIndices.kopfzeile.trim();
                        var parMatch = regLib.matchBetweenParenthesis(cInfo.name);
                        if(parMatch && parMatch.length>=1){
                            cInfo.waehrung = regLib.removeParenthesis(parMatch[0]);
                        }
                        returnObject.waehrungsinfo.push(cInfo);
                        continue; //Jump in loop a other conditions don't have to be checked
                    }else if(currentItemTextLC.indexOf("beschäftigte")!=-1){
                        //Special case: Beschäftigte is recognized as a seperate category, altough it's not bold
                        var jahrLocal = currentItemIndices.jahr;

                        if(currentItemIndices.kopfzeile!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();    
                        }  
                        currentItemIndices.kopfzeile = currentItemText.replace(/,/g,"");
                        currentItemIndices.jahr = jahrLocal;
                        currentItemIndices.durchschnitt = x;
                        //Create an Info Object for Weahrungsinfo 
                        cInfo = new infoObject();
                        cInfo.name = currentItemIndices.kopfzeile.trim();
                        var parMatch = regLib.matchBetweenParenthesis(cInfo.name);
                        if(parMatch && parMatch.length>=1){
                            cInfo.waehrung = regLib.removeParenthesis(parMatch[0]);
                        }
                        returnObject.waehrungsinfo.push(cInfo);
                        continue; //Jump in loop a other conditions don't have to be checked
                    }else{
                        //No headline ... it's a normal line 
                        var eintrag = new waehrungsEintrag();
                        eintrag.index = x;
                        eintrag.name = currentItemText;

                        var parMatch = utils.getParenthesisContent(currentItemText);
                        if(parMatch && parMatch.length>=1){
                            eintrag.waehrung = regLib.removeParenthesis(parMatch[0]); 
                        }else{
                            //Just take waehrung from top-level object 
                            eintrag.waehrung = cInfo.waehrung;
                        }
                        cInfo.eintraege.push(eintrag);
                    }

                    /* Legacy code: non-dynamic+dynamic recognition
                    //Add währungsinfo which is in brackets to output 
                    if(currentItemTextLC.indexOf("investitionen")!=-1){
                        currentOccurenceCount.konzern.investitionen = incrementOccurenceCount(currentOccurenceCount.konzern.investitionen);
                        currentItemIndices = assignIndex(itemIndicesGroups,currentItemIndices,["konzern","investitionen"],currentOccurenceCount,x);
                    }else if(currentItemTextLC.indexOf("jahresüberschu")!=-1){
                        currentOccurenceCount.konzern.jahresueberschuss = incrementOccurenceCount(currentOccurenceCount.konzern.jahresueberschuss);      
                        currentItemIndices = assignIndex(itemIndicesGroups,currentItemIndices,["konzern","jahresueberschuss"],currentOccurenceCount,x);
                        
                    }else if(currentItemTextLC.indexOf("gesamtüberschu")!=-1){
                        currentOccurenceCount.konzern.gesamtueberschuss = incrementOccurenceCount(currentOccurenceCount.konzern.gesamtueberschuss);                        
                        if(currentItemIndices.konzern.gesamtueberschuss!=-1){
                            itemIndicesGroups.push(currentItemIndices);                        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.konzern.gesamtueberschuss = x;
                    }else if(currentItemTextLC.indexOf("bilanzkurs")!=-1){
                        currentOccurenceCount.konzern.bilanzkurs = incrementOccurenceCount(currentOccurenceCount.konzern.bilanzkurs);                        
                        if(currentItemIndices.konzern.bilanzkurs!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.konzern.bilanzkurs = x;
                    }else if(currentItemTextLC.indexOf("eigenkapitalquote")!=-1){
                        currentOccurenceCount.konzern.eigenkapitalquote = incrementOccurenceCount(currentOccurenceCount.konzern.eigenkapitalquote);                           
                        if(currentItemIndices.konzern.eigenkapitalquote!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.konzern.eigenkapitalquote = x;
                    }else if(currentItemTextLC.indexOf("teilbetriebsergebnis")!=-1){
                        currentOccurenceCount.konzern.teilbetriebsergebnis = incrementOccurenceCount(currentOccurenceCount.konzern.teilbetriebsergebnis);                           
                        if(currentItemIndices.konzern.teilbetriebsergebnis!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.konzern.teilbetriebsergebnis = x;
                    }else if(currentItemTextLC.indexOf("gesch")!=-1 && currentItemTextLC.indexOf("ftsvolumen")!=-1){
                        currentOccurenceCount.konzern.geschaeftsvolumen = incrementOccurenceCount(currentOccurenceCount.konzern.geschaeftsvolumen);                                                
                        if(currentItemIndices.konzern.geschaeftsvolumen!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.konzern.geschaeftsvolumen = x;
                    }else if(currentItemTextLC.indexOf("bilanzsumme")!=-1){
                        currentOccurenceCount.konzern.bilanzsumme = incrementOccurenceCount(currentOccurenceCount.konzern.bilanzsumme);                                                
                        if(currentItemIndices.konzern.bilanzsumme!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.konzern.bilanzsumme = x;
                    }else if(currentItemTextLC.indexOf("anlagevermögen")!=-1){
                        currentOccurenceCount.konzern.anlagevermoegen = incrementOccurenceCount(currentOccurenceCount.konzern.anlagevermoegen);                                                
                        if(currentItemIndices.konzern.anlagevermoegen!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.konzern.anlagevermoegen = x;
                    }else if(currentItemTextLC.indexOf("eigenkapital")!=-1){
                        currentOccurenceCount.konzern.eigenkapital = incrementOccurenceCount(currentOccurenceCount.konzern.eigenkapital);                                                
                        if(currentItemIndices.konzern.eigenkapital!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.konzern.eigenkapital = x;
                    }else if(currentItemTextLC.indexOf("umsatzerl")!=-1){
                        currentOccurenceCount.konzern.umsatzerlaesse = incrementOccurenceCount(currentOccurenceCount.konzern.umsatzerlaesse);                                                
                        if(currentItemIndices.konzern.umsatzerlaesse!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.konzern.umsatzerlaesse = x;
                    }else if(currentItemTextLC.indexOf("durchschnitt")!=-1
                            ||currentItemTextLC.indexOf("mitarbeiter")!=-1
                            ||(currentItemTextLC.indexOf("beschäftigte")!=-1 && currentItem.indexOf("<b>")==-1)){
                                currentOccurenceCount.beschaeftigte.durchschnitt = incrementOccurenceCount(currentOccurenceCount.beschaeftigte.durchschnitt);                                                
                                if(currentItemIndices.beschaeftigte.durchschnitt!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.beschaeftigte.durchschnitt = x;
                    }else if(currentItemTextLC.indexOf("gj-ende")!=-1){
                        currentOccurenceCount.beschaeftigte.gj_ende = incrementOccurenceCount(currentOccurenceCount.beschaeftigte.gj_ende);                                                
                        if(currentItemIndices.beschaeftigte.gj_ende!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.beschaeftigte.gj_ende = x;
                    }else if(currentItemTextLC.indexOf("strom")!=-1){
                        currentOccurenceCount.umsatzsegmente.strom = incrementOccurenceCount(currentOccurenceCount.umsatzsegmente.strom);                                                
                        if(currentItemIndices.umsatzsegmente.strom!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.umsatzsegmente.strom = x;
                    }else if(currentItemTextLC.indexOf("bertragung")!=-1){
                        currentOccurenceCount.umsatzsegmente.uebertragung = incrementOccurenceCount(currentOccurenceCount.umsatzsegmente.uebertragung);                                                                        
                        if(currentItemIndices.umsatzsegmente.uebertragung!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.umsatzsegmente.uebertragung = x;
                    }else if(currentItemTextLC.indexOf("sonstiges")!=-1){
                        currentOccurenceCount.umsatzsegmente.sonstiges = incrementOccurenceCount(currentOccurenceCount.umsatzsegmente.sonstiges);                                                                                                
                        currentItemIndices.umsatzsegmente.sonstiges = assignIndex(itemIndicesGroups,currentItemIndices,"umsatzsegmente.sonstiges",currentOccurenceCount.umsatzsegmente.sonstiges);

                        if(currentItemIndices.umsatzsegmente.sonstiges!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.umsatzsegmente.sonstiges = x;
                    }else if(currentItemTextLC.indexOf("gesamt")!=-1 && currentItemTextLC.indexOf("berschuss")==-1){
                        currentOccurenceCount.umsatzsegmente.gesamt = incrementOccurenceCount(currentOccurenceCount.umsatzsegmente.gesamt);                                                                                                
                        if(currentItemIndices.umsatzsegmente.gesamt!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.umsatzsegmente.gesamt = x;
                    }else{
                        currentOccurenceCount[currentItemText] = incrementOccurenceCount(currentOccurenceCount[currentItemText]);                                                    
                        currentItemIndices = assignIndex(currentItemIndices,currentItemText,currentOccurenceCount,x);
                        
                    }         
                    */
                    //dynamic index recognition only
                    currentOccurenceCount[currentItemText] = incrementOccurenceCount(currentOccurenceCount[currentItemText]);                                                    
                    currentItemIndices = assignIndex(currentItemIndices,currentItemText,currentOccurenceCount,x);
                   
                }
                occurrenceCounterGroups.push(currentOccurenceCount);
                itemIndicesGroups.push(currentItemIndices);
            }else{ 
                //The values get assigned to the indices here 
                var filledItem = parseColumnContentToItemKennzahlen(currentColumn,itemIndicesGroups);
                //if(filledItem["Beschäftigte"] && filledItem["Beschäftigte"][0])debugger; //J4T 
                filledItem = adaptYearInFilledItem(filledItem,returnObject.kennzahlen,pushCtr);
                //if(filledItem.refactored){ //J4T 
                    //returnObject.refactored = true; 
                //}
                if(!utils.isObjectEmpty(filledItem)){
                    for(var key in filledItem){
                        if(filledItem.hasOwnProperty(key)){
                            var currentFilledItem = filledItem[key];
                            for(var k=0;k<currentFilledItem.length;k++){                                   
                                if(currentFilledItem[k].jahr=="")debugger; //J4T 
                                returnObject.kennzahlen = pushItemToReturnObject(key,currentFilledItem[k],returnObject.kennzahlen,pushCtr);                                
                            }
                        }
                    }
                }
            }  
        }
    }


    //Remove the empty entries from kennzahlen and notizen
   for(var key in returnObject.kennzahlen){
        if(returnObject.kennzahlen.hasOwnProperty(key)){         
            returnObject.kennzahlen[key] = utils.removeEmptyEntriesFromArray(returnObject.kennzahlen[key]);
            if(returnObject.kennzahlen[key].length==0) delete returnObject.kennzahlen[key];
        }
   }

    returnObject.notizen = utils.removeEmptyEntriesFromArray(returnObject.notizen);
    //Add a numberation determined by callnumber to the realReturnObject
    var key = "boersenbewertung"+callnumber;
    var realReturnObject = {
        [key]: returnObject,
        refactored: returnObject.refactored
    }
    return realReturnObject;
}

/**
 * Helper function for parsing kennzahlen
 * If undefined counter or non-assigned then return 1, else increment counter 
 * @param {number} counter 
 */
function incrementOccurenceCount(counter){
    if(!counter || counter==-1){
        return 1;
    }else{
        return counter +1; 
    }
}
/**
 * Helper function for parsing kennzahlen 
 * Assign the number value in indexToAssign to the currentItemIndices object
 * Take the key as assignment key, but if there are multiple keys add a counter to the key 
 * which reflects the number of occurence 
 * @param {object} currentItemIndices 
 * @param {string} key 
 * @param {object} occurences 
 * @param {integer} indexToAssign 
 */
function assignIndex(currentItemIndices,key,occurences,indexToAssign){
    var occurenceCount = occurences[key];
    //Forge a key with an index if the item occurs multiple times
    var occurenceAddition ="";
    if(occurenceCount && occurenceCount>1){
        occurenceAddition = "¦"+String(occurenceCount)+"¦"; //Vertical Bars are for marking this
    }
    
    var keyWithOccurence=key+occurenceAddition;

    currentItemIndices[keyWithOccurence] = indexToAssign;

    return currentItemIndices;
}



/**
 * If there is a year missing in one item of the filledItem, then just take the year from other category 
 * @param {object} filledItem 
 * @returns {object} refactored filled item 
 */
function adaptYearInFilledItem(filledItem,returnObject,rowIndex){
    if(!filledItem) return filledItem;
    if(utils.isObjectEmpty(filledItem)) return filledItem;  
    var previousJahr = "";
    for(var key in filledItem){
        if(filledItem.hasOwnProperty(key)){
            var currentFilledItem = filledItem[key];
            for(var x=0;x<currentFilledItem.length;x++){
                if(currentFilledItem[x].jahr){
                    previousJahr = currentFilledItem[x].jahr;
                }else{
                    currentFilledItem[x].jahr = previousJahr;
                }
            }         
        }
    }

    if(!returnObject || utils.isObjectEmpty(returnObject)) return filledItem; 
    //If this method doesn't work, take the indices from a previous key in returnObject 
    //Search the last return item 
    var currentReturnItem; 
    for(var retObjectKey in returnObject){
        var filledItemFirstKey = Object.keys(filledItem)[0];
        if(retObjectKey=="trimAll"){
            //debugger;
            continue;
        }
        if(retObjectKey === filledItemFirstKey){
            //When the previous table is longer then the current, assume the year information is in the previous one
           if(currentReturnItem){
                if(returnObject[retObjectKey].length<currentReturnItem.length){
                    break;
                }
           }
        }
        //add a length condition 
        currentReturnItem =  returnObject[retObjectKey];
    }

    //if(!currentReturnItem)debugger;
    for(var key in filledItem){
        if(filledItem.hasOwnProperty(key)){
            var currentFilledItem = filledItem[key];
            for(var x=0;x<currentFilledItem.length;x++){
                if(!currentFilledItem[x].jahr){
                    if(!currentReturnItem[rowIndex-1]){
                        continue; //Try with the next object 
                    }else{
                        if(currentReturnItem[rowIndex-1].jahr){
                            currentFilledItem[x].jahr = currentReturnItem[rowIndex-1].jahr;
                            //filledItem.refactored = true; //Checkflag for debugging; J4T 
                        }                           
                    }
                }
            }         
        }
    }
    return filledItem;
}

/**
 * Check if a table array contains a year at a defined position,
 * the first year index which is found gets attached to currentItemindices, which gets
 * then returned
 * @param {array} tables - array which can contain multiple tables 
 * @param {object} currentItemIndices - contains item indices, also for jahr
 * @param {integer} i - the columnIndex within the tables which is checked 
 * @param {integer} x - the value which is assigned to the jahr property in cII, when found 
 * @returns {object} modified/original currentItemIndices 
 */
function checkIfTableContainsYear(tables,currentItemIndices,i,x){
    if(!tables) return currentItemIndices;

    for(var n=0;n<tables.length;n++){
        if(!tables[n])debugger;
        var toCheck = tables[n][i];
        var toCheckText = utils.htmlText2Text(toCheck);
        var numberMatch = regLib.matchNumber(toCheck);
        if(numberMatch && numberMatch.length>=1){            
            currentItemIndices.jahr = x;
            break; 
        }
    }
    return currentItemIndices;
}


/**
 * Parse the tables which contain bilanzen 
 * TODO: still contains the old row headers, remove at the day they are not needed anymore
 * @param {array} tablesParsed - set of tables after parsing whith cheerio
 * @param {array} tablesArr - original tables array before parsing (contains also html-tags)
 * @param {object} rest - entries between the tables and their line indices
 * @param {object} infos - start and stop line-indices of the tables in 'tablesParsed'
 * @param {string} headline -  string in headline, from which the currency is extracted
 * @returns {object} - parsed content 
 */
function parse_aus_bilanzen(tablesParsed,tablesArr,rest,infos, headline){
    
    var returnObject = {
        ausBilanzen: {},
        notizen: [],
        waehrung: null
    }; 
    
    //Get the Währung from headline 
    var headlineText = utils.htmlText2Text(headline);
    var parenthesisMatch = regLib.matchBetweenParenthesis(headlineText);
    var waehrung = null; 
    
    if(parenthesisMatch && parenthesisMatch[0]){
        waehrung = parenthesisMatch[0].replace("(","").replace(")","").trim();
        returnObject.waehrung = waehrung;
    }
    /**
     * Holder class for item indices, more will be added dynamically during runtime
     */
    function itemIndices(){
        this.kopfzeile =-1; //Can be Kennzahlen der Erträge
        this.jahr=-1;
    };
    //Row indices of which assign values to  variables, 
    //these are assigned by parsing the first column in the array 
    /* LEGACY 
    function itemIndices(){
        this.jahr=-1;
        this.aktiva = {
            anlagevermoegen:-1,
            goodwill: -1,
            anlagevermoegen_sachanlagen: -1,
            anlagevermoegen_beteiligungen: -1,
            vorraete: -1,
            wertpapiere_fluessigemittel: -1,
            umlaufvermoegen: -1,
            umlaufvermoegen_fluessigemittel: -1,
            rechnungsabgrenzung: -1,
        }
        this.passiva = {
            eigenkapital: -1,
            eigenkapital_davon_gezeichnetes_kapital: -1,
            eigenkapital_davon_bilanzergebniss:-1,
            sopo_mit_ruecklageant:-1,
            investitionszueschuesse:-1,
            fremdkapital:-1,
            fremdkapital_pensionsrueckstell:-1,
            fremdkapital_andere_rueckstell:-1,
            fremdkapital_andere_verbindlichk:-1,
            fremdkapital_langfr_verbindlichk:-1,
            fremdkapital_kurzfrmfr_verbindlichk:-1,
            pensionsrueckstellungen: -1,
            rueckstellungen: -1,
            andere_rueckstellungen: -1,
            verbindlichkeiten: -1,
            verbindlichkeiten_davon_ueber_1jahr: -1,
            bilanzsumme: -1
        }
        this.notizen= []
    };
    */
    var indexAktiva=-1;
    var indexPassiva=-1;

    //Contains identifiers for columns, if there are additional ones, than 'jahr'
    var columnIdentifiers = []; 

    
    //Find the additional information in Headerline, which can be in rest
    for(key in rest){
        if(rest.hasOwnProperty(key)){
            var currentRest = utils.htmlText2Text(rest[key]);
            //If the current rest is tagged with aus den bilanzen 
            if(currentRest && currentRest.indexOf("Aus den Bilanzen")!=-1){
                var headline = utils.htmlText2Text(rest[0]).replace("Aus den Bilanzen","");
                var matchPar = regLib.matchBetweenParenthesis(headline);
                debugger;
                if(matchPar[0]){
                    debugger;
                    returnObject.notizen.push(matchPar[0]);
                }               
            }else{
                returnObject.notizen.push(currentRest);
            }
        }
    }

    //Find all the column identfiers (something like 'AG' or 'Konzern') and push them to 'columnIdentifiers'
    var startIncr=0; 
    if(tablesParsed.length==3){ //This means there is an additional table 
        startIncr=1;
        var numberOfColumns = tablesParsed[1].length-1; //Columns with content number 
        var numberOfIdentifiers = tablesParsed[0].length-1;
        var identifierSpan = numberOfColumns / numberOfIdentifiers;
        for(var i=1;i<tablesParsed[0].length;i++){
            var currentIdentifier = utils.htmlText2Text(tablesParsed[0][i][0]).trim();
            for(var x=0;x<identifierSpan;x++){
                columnIdentifiers.push(currentIdentifier);
            }
        }
    }
    //Go through all tables from the first readable table
    for(var s=0+startIncr;s<tablesParsed.length;s++){
        var tableAusBilanzen = tablesParsed[s];
        var itemIndicesGroups =[];
        var occurrenceCounterGroups =[]; //Counts the occurences of item indices 
        var currentItemIndices = new itemIndices();
        var currentOccurenceCount = new itemIndices(); //Count the occurence of items to get an indexing for redundant entries
        var pushCtr=-1;
        
        for(var i=0;i<tableAusBilanzen.length;i++){
            var currentColumn = tableAusBilanzen[i];
            var nextColumn    = tableAusBilanzen[i+1];
            if(currentColumn[0] && utils.htmlText2Text(currentColumn[0]).trim()
                ||currentColumn[1] && utils.htmlText2Text(currentColumn[1]).trim()){
                pushCtr = pushCtr +1;
            }
            if(i==0){
                
                //Assign the item indices
                for(var x=0;x<currentColumn.length;x++){
                    //If there is a double definition of one entry the array gets reset
                    var currentItem = currentColumn[x];
                    var nextItem;
                    if(nextColumn){
                        nextItem = nextColumn[x];
                    }
                    var currentItemText = utils.htmlText2Text(currentItem).trim();
                
                    //Additional special case: find year when there is an empty start tag 
                    if(currentItem.indexOf('<b></b>')!=-1){
                        currentItemIndices = checkIfTableContainsYear(tableAusBilanzen,currentItemIndices,i,x);                               
                    }else if(currentItem.indexOf("<b>")!=-1 && currentItem.indexOf("</b>")!=-1){
                        if(currentItemIndices.kopfzeile!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();    
                        }  
                        currentItemIndices.kopfzeile = currentItemText.replace(/,/g,"");
                        if(currentItemIndices.jahr==-1){
                            currentItemIndices = checkIfTableContainsYear(tableAusBilanzen,currentItemIndices,i,x);                           
                        }
                    }

                    var currentItemText = utils.htmlText2Text(currentItem).trim();
                    var currentItemTextLC = currentItemText.toLowerCase();

                    //Additional special case: recognize index passiva 
                    /*
                    if(currentItemTextLC && currentItemTextLC.indexOf("aktiva")!=-1){
                        indexAktiva = x; 
                    }else if(currentItemTextLC && currentItemTextLC.indexOf("passiva")!=-1){
                        indexPassiva = x; 
                    }
                    */
                    //Skip empty items 
                    if(!currentItem||!currentItemTextLC)continue;

                    currentOccurenceCount[currentItemTextLC] = incrementOccurenceCount(currentOccurenceCount[currentItemTextLC]);                                                               
                    //currentItemIndices[currentItemTextLC] = x;
                    currentItemIndices = assignIndex(currentItemIndices,currentItemTextLC,currentOccurenceCount,x);                           
                    
                    //Check the rest of the cases 
                    /* THIS IS LEGACY - indices items are assigned dynamically 
                    if((currentItemTextLC.indexOf("bilanzsumme")==-1 && nextItem && nextItem.indexOf("</b>")!=-1)){
                        currentOccurenceCount.jahr = incrementOccurenceCount(currentOccurenceCount.jahr);      
                        
                        if(currentItemIndices.jahr!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();    
                        }  
                        currentItemIndices.jahr = x;
                    }else if(currentItemTextLC.indexOf("anlagevermögen")!=-1){
                        currentOccurenceCount.aktiva.anlagevermoegen = incrementOccurenceCount(currentOccurenceCount.aktiva.anlagevermoegen);      
                        
                        if(currentItemIndices.aktiva.anlagevermoegen!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();
                        }
                        currentItemIndices.aktiva.anlagevermoegen = x;
                    }else if(currentItemTextLC.indexOf("goodwill")!=-1){
                        currentOccurenceCount.aktiva.goodwill = incrementOccurenceCount(currentOccurenceCount.aktiva.goodwill);      
                        
                        if(currentItemIndices.aktiva.goodwill!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();
                        }
                        currentItemIndices.aktiva.goodwill = x;
                    }else if(currentItemTextLC.indexOf("sachanlage")!=-1){
                        currentOccurenceCount.aktiva.anlagevermoegen_sachanlagen = incrementOccurenceCount(currentOccurenceCount.aktiva.anlagevermoegen_sachanlagen);      
                        
                        if(currentItemIndices.aktiva.anlagevermoegen_sachanlagen!=-1){
                            itemIndicesGroups.push(currentItemIndices);                        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.aktiva.anlagevermoegen_sachanlagen = x;
                    }else if(currentItemTextLC.indexOf("beteiligungen")!=-1){
                        currentOccurenceCount.aktiva.anlagevermoegen_beteiligungen = incrementOccurenceCount(currentOccurenceCount.aktiva.anlagevermoegen_beteiligungen);      
                        
                        if(currentItemIndices.aktiva.anlagevermoegen_beteiligungen!=-1){
                            itemIndicesGroups.push(currentItemIndices);                        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.aktiva.anlagevermoegen_beteiligungen = x;
                    }else if(currentItemTextLC.indexOf("umlaufvermögen")!=-1){
                        currentOccurenceCount.aktiva.umlaufvermoegen = incrementOccurenceCount(currentOccurenceCount.aktiva.umlaufvermoegen);      
                        
                        if(currentItemIndices.aktiva.umlaufvermoegen!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.aktiva.umlaufvermoegen = x;
                    }else if(currentItemTextLC.indexOf("flüssige mittel")!=-1 && currentItemTextLC.indexOf("wertpapiere")!=-1){
                        currentOccurenceCount.aktiva.wertpapiere_fluessigemittel = incrementOccurenceCount(currentOccurenceCount.aktiva.wertpapiere_fluessigemittel);      
                        
                        if(currentItemIndices.aktiva.wertpapiere_fluessigemittel!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.aktiva.wertpapiere_fluessigemittel = x;
                    }else if(currentItemTextLC.indexOf("flüssige mittel")!=-1 && currentItemTextLC.indexOf("..")!=-1){
                        currentOccurenceCount.aktiva.umlaufvermoegen_fluessigemittel = incrementOccurenceCount(currentOccurenceCount.aktiva.umlaufvermoegen_fluessigemittel);      
                        
                      
                        if(currentItemIndices.aktiva.umlaufvermoegen_fluessigemittel!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.aktiva.umlaufvermoegen_fluessigemittel = x;
                    }else if(currentItemTextLC.indexOf("vorräte")!=-1){
                        currentOccurenceCount.aktiva.vorraete = incrementOccurenceCount(currentOccurenceCount.aktiva.vorraete);      
                        
                        if(currentItemIndices.aktiva.vorraete!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.aktiva.vorraete = x;
                    }else if(currentItemTextLC.indexOf("rechnungsabgrenzung")!=-1){
                        
                        var ident; //indicator, to which item the stuff belongs aktiva or passiva
                        if( utils.doesArrayContainString(currentColumn,"Aktiva")){
                            ident ="aktiva";
                        }else if(utils.doesArrayContainString(currentColumn,"Passiva")){
                            ident ="passiva";
                        }else{  
                            ident ="aktiva";
                        }
                        currentOccurenceCount[ident].rechnungsabgrenzung = incrementOccurenceCount(currentOccurenceCount[ident].rechnungsabgrenzung);      
                        
                        if(currentItemIndices[ident].rechnungsabgrenzung!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices[ident].rechnungsabgrenzung = x;
                    }
            
                    else if(currentItemTextLC.indexOf("eigenkapital")!=-1){
                        currentOccurenceCount.passiva.eigenkapital = incrementOccurenceCount(currentOccurenceCount.passiva.eigenkapital);      
                        
                        if(currentItemIndices.passiva.eigenkapital!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.eigenkapital = x;
                    }else if(currentItemTextLC.indexOf("gezeichnetes kapital")!=-1){
                        currentOccurenceCount.passiva.eigenkapital_davon_gezeichnetes_kapital = incrementOccurenceCount(currentOccurenceCount.passiva.eigenkapital_davon_gezeichnetes_kapital);      
                        
                        if(currentItemIndices.passiva.eigenkapital_davon_gezeichnetes_kapital!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.eigenkapital_davon_gezeichnetes_kapital = x;
                    }else if(currentItemTextLC.indexOf("bilanzergebnis")!=-1){
                        currentOccurenceCount.passiva.eigenkapital_davon_bilanzergebniss = incrementOccurenceCount(currentOccurenceCount.passiva.eigenkapital_davon_bilanzergebniss);      
                        
                        if(currentItemIndices.passiva.eigenkapital_davon_bilanzergebniss!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.eigenkapital_davon_bilanzergebniss = x;
                    }else if(currentItemTextLC.indexOf("rückstellungen")!=-1 && currentItemTextLC.indexOf("pensions")==-1 ){
                        currentOccurenceCount.passiva.andere_rueckstellungen = incrementOccurenceCount(currentOccurenceCount.passiva.andere_rueckstellungen);      
                        
                        if(currentItemIndices.passiva.andere_rueckstellungen!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.andere_rueckstellungen = x;
                    }else if(currentItemTextLC.indexOf("verbindlichkeiten")!=-1){
                        currentOccurenceCount.passiva.verbindlichkeiten = incrementOccurenceCount(currentOccurenceCount.passiva.verbindlichkeiten);      
                        
                        if(currentItemIndices.passiva.verbindlichkeiten!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.verbindlichkeiten = x;
                    }else if(currentItemTextLC.indexOf("davon über")!=-1 && currentItemTextLC.indexOf("jahr")!=-1){
                        currentOccurenceCount.passiva.verbindlichkeiten_davon_ueber_1jahr = incrementOccurenceCount(currentOccurenceCount.passiva.verbindlichkeiten_davon_ueber_1jahr);      
                        
                        if(currentItemIndices.passiva.verbindlichkeiten_davon_ueber_1jahr!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.verbindlichkeiten_davon_ueber_1jahr = x;
                    }else if(currentItemTextLC.indexOf("bilanzsumme")!=-1){
                        currentOccurenceCount.passiva.bilanzsumme = incrementOccurenceCount(currentOccurenceCount.passiva.bilanzsumme);      
                        
                        if(currentItemIndices.passiva.bilanzsumme!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.bilanzsumme = x;
                    }else if(currentItemTextLC.indexOf("andere rückstellungen")!=-1){
                        currentOccurenceCount.passiva.andere_rueckstellungen = incrementOccurenceCount(currentOccurenceCount.passiva.andere_rueckstellungen);      
                        
                        if(currentItemIndices.passiva.andere_rueckstellungen!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.andere_rueckstellungen = x;
                    }else if(currentItemTextLC.indexOf("sopo m. rücklage")!=-1){
                        currentOccurenceCount.passiva.sopo_mit_ruecklageant = incrementOccurenceCount(currentOccurenceCount.passiva.sopo_mit_ruecklageant);      
                        
                        if(currentItemIndices.passiva.sopo_mit_ruecklageant!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.sopo_mit_ruecklageant = x;
                    }else if(currentItemTextLC.indexOf("investitionszusch")!=-1){
                        currentOccurenceCount.passiva.investitionszueschuesse = incrementOccurenceCount(currentOccurenceCount.passiva.investitionszueschuesse);      
                        
                        if(currentItemIndices.passiva.investitionszueschuesse!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.investitionszueschuesse = x;
                    }else if(currentItemTextLC.indexOf("fremdkapital")!=-1){
                        currentOccurenceCount.passiva.fremdkapital = incrementOccurenceCount(currentOccurenceCount.passiva.fremdkapital);      
                        
                        if(currentItemIndices.passiva.fremdkapital!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.fremdkapital = x;
                    }else if(currentItemTextLC.indexOf("pensionsrückstell")!=-1 && currentItemTextLC.indexOf("..")!=-1){
                        currentOccurenceCount.passiva.fremdkapital_pensionsrueckstell = incrementOccurenceCount(currentOccurenceCount.passiva.fremdkapital_pensionsrueckstell);      
                        
                        if(currentItemIndices.passiva.fremdkapital_pensionsrueckstell!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.fremdkapital_pensionsrueckstell = x;
                    }else if(currentItemTextLC.indexOf("pensionsrückstellungen")!=-1){
                        currentOccurenceCount.passiva.pensionsrueckstellungen = incrementOccurenceCount(currentOccurenceCount.passiva.pensionsrueckstellungen);      
                        
                        if(currentItemIndices.passiva.pensionsrueckstellungen!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.pensionsrueckstellungen = x;
                    }else if(currentItemTextLC.indexOf("and. rückstellungen")!=-1){
                        currentOccurenceCount.passiva.andere_rueckstellungen = incrementOccurenceCount(currentOccurenceCount.passiva.andere_rueckstellungen);      
                        
                        if(currentItemIndices.passiva.andere_rueckstellungen!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.andere_rueckstellungen = x;
                    }else if(currentItemTextLC.indexOf("langfr")!=-1 && currentItemTextLC.indexOf("verbindl")!=-1){
                        currentOccurenceCount.passiva.fremdkapital_langfr_verbindlichk = incrementOccurenceCount(currentOccurenceCount.passiva.fremdkapital_langfr_verbindlichk);      
                        
                        if(currentItemIndices.passiva.fremdkapital_langfr_verbindlichk!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.fremdkapital_langfr_verbindlichk = x;
                    }else if(currentItemTextLC.indexOf("kurz")!=-1 && currentItemTextLC.indexOf("verbindl")!=-1){
                        currentOccurenceCount.passiva.fremdkapital_kurzfrmfr_verbindlichk = incrementOccurenceCount(currentOccurenceCount.passiva.fremdkapital_kurzfrmfr_verbindlichk);      
                        
                        if(currentItemIndices.passiva.fremdkapital_kurzfrmfr_verbindlichk!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.passiva.fremdkapital_kurzfrmfr_verbindlichk = x;
                    }else{
                        if(indexAktiva!=-1 && indexPassiva ==-1){
                            currentOccurenceCount.aktiva[currentItemTextLC] = incrementOccurenceCount(currentOccurenceCount.aktiva[currentItemTextLC]);                                  
                            //currentItemIndices.aktiva[currentItemTextLC] = x; 
                            currentItemIndices = assignIndex(currentItemIndices,currentItemTextLC,currentOccurenceCount,x);
                            //debugger;
                        }else if(indexAktiva!=-1 && indexPassiva!=-1){
                            currentOccurenceCount.passiva[currentItemTextLC] = incrementOccurenceCount(currentOccurenceCount.passiva[currentItemTextLC]);                                                              
                            //currentItemIndices.passiva[currentItemTextLC] = x; 
                            currentItemIndices = assignIndex(currentItemIndices,currentItemTextLC,currentOccurenceCount,x);
                            //debugger;
                        }else{
                           currentOccurenceCount[currentItemTextLC] = incrementOccurenceCount(currentOccurenceCount[currentItemTextLC]);                                                               
                           //currentItemIndices[currentItemTextLC] = x;
                           currentItemIndices = assignIndex(currentItemIndices,currentItemTextLC,currentOccurenceCount,x);                           
                            //debugger;
                        }
                        
                    }*/
                }
                occurrenceCounterGroups.push(currentOccurenceCount);                
                itemIndicesGroups.push(currentItemIndices);
            }else{ 

                //Create a filled item from the tables 
                var filledItem = parseColumnContentToItemKennzahlen(currentColumn,itemIndicesGroups);
        
                filledItem = adaptYearInFilledItem(filledItem,returnObject.ausBilanzen,pushCtr);

                //Push the filled item content to the returnobject
                if(!utils.isObjectEmpty(filledItem)){
                    for(var key in filledItem){
                        if(filledItem.hasOwnProperty(key)){
                            var currentFilledItem = filledItem[key];
                            for(var k=0;k<currentFilledItem.length;k++){    
                                if(columnIdentifiers.length>0 &&columnIdentifiers[i-1]){
                                    currentFilledItem[k]["columnId"] = columnIdentifiers[i-1];
                                }
                                if(currentFilledItem[k].jahr=="")debugger; //J4T 
                                returnObject.ausBilanzen = pushItemToReturnObject(key,currentFilledItem[k],returnObject.ausBilanzen,pushCtr);                                
                            }
                        }
                    }
                }






                //The values get assigned to the indices here 
                /* LEGACY
                var filledItem = parseColumnContentToItem(currentColumn,itemIndicesGroups);
                if(columnIdentifiers.length>0 &&columnIdentifiers[i-1]){
                    filledItem["columnId"] = columnIdentifiers[i-1];
                }
                //Push the values to returnobject 
                returnObject = pushItemToReturnObject("ausBilanzen",filledItem,returnObject,i);
                */
            }  
        }
    }


    //returnObject.ausBilanzen = utils.removeEmptyEntriesFromArray(returnObject.ausBilanzen);
    returnObject.notizen = utils.removeEmptyEntriesFromArray(returnObject.notizen);

    return returnObject;
}


/**
 * Parse the tables which aus gewinn and verlustrechnungen
 * @param {array} tablesParsed - set of tables after parsing whith cheerio
 * @param {array} tablesArr - original tables array before parsing (contains also html-tags)
 * @param {object} rest - entries between the tables and their line indices
 * @param {object} infos - start and stop line-indices of the tables in 'tablesParsed'
 * @param {string} headline - the identifier for the first item in the table
 * @returns {object} - parsed content 
 */
function parse_aus_gewinn_und_verlustrechnungen(tablesParsed,tablesArr,rest,infos,headline){

    var returnObject = {
        ausGewinnUndVerlustRechnung: [],
        notizen: []
    }; 
    
    //Get the Währung from headline 
    var parenthesisMatch = regLib.matchBetweenParenthesis(headline);
    var waehrung = null; 
    if(parenthesisMatch && parenthesisMatch[0]){
        waehrung = parenthesisMatch[0].replace("(","").replace(")","").trim();
        returnObject.waehrung = waehrung;
    }

    //Row indices of which assign values to  variables, 
    //these are assigned by parsing the first column in the array 
    function itemIndices(){
        this.jahr=-1;
        this.bestandsveraenderung=-1;
        this.akteigenleistung=-1;
        this.sonstbetrerträge=-1;
        this.materialaufwand=-1;
        this.personalaufwand=-1;
        this.abschreibungen=-1;
        this.sonstbetraufwand=-1;
        this.finanzergebnis =-1;
        this.ergebnis_d_gewoehnlichen_geschaeftstaetigkeit=-1;
        this.aoergebnis=-1;
        this.steuern=-1;
        this.eesteuern=-1;
        this.jahresergebnis=-1;
        this.notizen= []
    };
    //Index for aktiva and passiva headlines
    var indexAktiva=-1;
    var indexPassiva=-1;

    var columnIdentifiers = []; //Contains identifiers for columns, if there are additional ones, than 'jahr'

    //Find the additional information in Headerline which is in rest
    for(key in rest){
        if(rest.hasOwnProperty(key)){
            var currentRest = utils.htmlText2Text(rest[key]);
            if(currentRest && currentRest.indexOf("Aus den Bilanzen")!=-1){
                var headline = utils.htmlText2Text(rest[0]).replace("Aus den Bilanzen","");
                var matchPar = regLib.matchBetweenParenthesis(headline);
                debugger;
                if(matchPar[0]){
                    debugger;
                    returnObject.notizen.push(matchPar[0]);
                }               
            }else{
                returnObject.notizen.push(currentRest);
            }
        }
    }

    //If there is an 'headertable' which has no content, make a hop, also push 
    var startIncr=0; 
    if(tablesParsed.length==2){ //This means there is an additional table 
        startIncr=1;
        var numberOfColumns = tablesParsed[1].length-1; //Columns with content number 
        var numberOfIdentifiers = tablesParsed[0].length-1;
        var identifierSpan = numberOfColumns / numberOfIdentifiers;
        for(var i=1;i<tablesParsed[0].length;i++){
            var currentIdentifier = utils.htmlText2Text(tablesParsed[0][i][0]).trim();
            for(var x=0;x<identifierSpan;x++){
                columnIdentifiers.push(currentIdentifier);
            }
        }
    }
    //Go through table, mind table hop 
    for(var s=0+startIncr;s<tablesParsed.length;s++){
        var tableAusGUV  = tablesParsed[s];
        var itemIndicesGroups =[];

        for(var i=0;i<tableAusGUV.length;i++){
            var currentColumn = tableAusGUV[i];
            var nextColumn    = tableAusGUV[i+1];
            if(i==0){
                var currentItemIndices = new itemIndices();
                //Assign the item indices
                for(var x=0;x<currentColumn.length;x++){
                    //If there is a double definition of one entry the array gets reset
                    var currentItem = currentColumn[x];
                    var nextItem;
                    if(nextColumn){
                        nextItem = nextColumn[x];
                    }

                
                    //Additional special case: find year when there is an empty start tag 
                    if(currentItem.indexOf('<b></b>')!=-1){
                        for(var n=0;n<tableAusGUV.length;n++){
                            if(!tableAusGUV[n])debugger;
                            var toCheck = tableAusGUV[n][i];
                            var toCheckText = utils.htmlText2Text(toCheck);
                            var numberMatch = regLib.matchNumber(toCheck);
                            if(numberMatch && numberMatch.length>=1){
                                if(currentItemIndices.jahr!=-1){
                                    itemIndicesGroups.push(currentItemIndices);
                                    currentItemIndices = new itemIndices();    
                                }  
                                currentItemIndices.jahr = x;
                                continue; //break inner loop 
                            }
                        }
                    }

                    var currentItemTextLC = utils.htmlText2Text(currentItem).trim().toLowerCase();

                    //Additional special case: recognize index passiva 
                    if(currentItemTextLC && currentItemTextLC.indexOf("aktiva")!=-1){
                        indexAktiva = x; 
                    }else if(currentItemTextLC && currentItemTextLC.indexOf("passiva")!=-1){
                        indexPassiva = x; 
                    }

                    //Skip empty items 
                    if(!currentItem||!currentItemTextLC)continue;
                    /**
                     * Check the rest of the cases, assign indices for each index,
                     * if something occurs double, create a new item (assume that another group starts)
                     */                   
                    if((currentItemTextLC.indexOf("bilanzsumme")==-1 && nextItem && nextItem.indexOf("</b>")!=-1)){
                        if(currentItemIndices.jahr!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();    
                        }  
                        currentItemIndices.jahr = x;
                    }else if(currentItemTextLC.indexOf("umsatz")!=-1){
                        if(currentItemIndices.umsatz!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();
                        }
                        currentItemIndices.umsatz = x;
                    }else if(currentItemTextLC.indexOf("bestandsveränderung")!=-1){
                        if(currentItemIndices.bestandsveraenderung!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();
                        }
                        currentItemIndices.bestandsveraenderung = x;
                    }else if(currentItemTextLC.indexOf("akt")!=-1 && currentItemTextLC.indexOf("eigenleistung")!=-1){
                        if(currentItemIndices.akteigenleistung!=-1){
                            itemIndicesGroups.push(currentItemIndices);                        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.akteigenleistung = x;
                    }else if(currentItemTextLC.indexOf("sonst")!=-1 && currentItemTextLC.indexOf("betr")!=-1 && currentItemTextLC.indexOf("erträge")!=-1){
                        if(currentItemIndices.sonstbetrerträge!=-1){
                            itemIndicesGroups.push(currentItemIndices);                        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.sonstbetrerträge = x;
                    }else if(currentItemTextLC.indexOf("materialaufwand")!=-1){
                        if(currentItemIndices.materialaufwand!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();
                        }
                        currentItemIndices.materialaufwand = x;
                    }else if(currentItemTextLC.indexOf("personalaufwand")!=-1){
                        if(currentItemIndices.personalaufwand!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();
                        }
                        currentItemIndices.personalaufwand = x;
                    }else if(currentItemTextLC.indexOf("abschreibungen")!=-1){
                        if(currentItemIndices.abschreibungen!=-1){
                            itemIndicesGroups.push(currentItemIndices);
                            currentItemIndices = new itemIndices();
                        }
                        currentItemIndices.abschreibungen = x;
                    }else if(currentItemTextLC.indexOf("sonst")!=-1 && currentItemTextLC.indexOf("betr")!=-1 && currentItemTextLC.indexOf("aufwand")!=-1){
                        if(currentItemIndices.sonstbetraufwand!=-1){
                            itemIndicesGroups.push(currentItemIndices);                        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.sonstbetraufwand = x;
                    }else if(currentItemTextLC.indexOf("finanzergebnis")!=-1){
                        if(currentItemIndices.finanzergebnis!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.finanzergebnis = x;
                    }else if(currentItemTextLC.indexOf("ergebnis")!=-1 && currentItemTextLC.indexOf("geschäftstätigkeit")!=-1){
                        if(currentItemIndices.ergebnis_d_gewoehnlichen_geschaeftstaetigkeit!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.ergebnis_d_gewoehnlichen_geschaeftstaetigkeit = x;
                    }else if(currentItemTextLC.indexOf("ao ergebnis")!=-1){
                        if(currentItemIndices.aoergebnis!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.aoergebnis = x;
                    }else if(currentItemTextLC.indexOf("steuern")!=-1 
                        && currentItemTextLC.indexOf("ee")==-1){
                        
                        if(currentItemIndices.steuern!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.steuern = x;
                    }else if(currentItemTextLC.indexOf("ee-steuern")!=-1){
                        if(currentItemIndices.eesteuern!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.eesteuern = x;
                    }else if(currentItemTextLC.indexOf("jahresergebnis")!=-1){
                        if(currentItemIndices.jahresergebnis!=-1){
                            itemIndicesGroups.push(currentItemIndices);        
                            currentItemIndices = new itemIndices();
                        }                   
                        currentItemIndices.jahresergebnis = x;
                    }else{                    
                        currentItemIndices[currentItemTextLC] = x; 
                    }
 
                }
                
                itemIndicesGroups.push(currentItemIndices);
            }else{ 
                //The values get assigned to the indices here 
                var filledItem = parseColumnContentToItem(currentColumn,itemIndicesGroups);
                if(columnIdentifiers.length>0 &&columnIdentifiers[i-1]){
                    filledItem["columnId"] = columnIdentifiers[i-1];
                }
                //Push the values to returnobject 
                returnObject = pushItemToReturnObject("ausGewinnUndVerlustRechnung",filledItem,returnObject,i);
            }  
        }
    }

    //Clear empty entries and add results to returnobject
    returnObject.ausGewinnUndVerlustRechnung = utils.removeEmptyEntriesFromArray(returnObject.ausGewinnUndVerlustRechnung);
    returnObject.notizen = utils.removeEmptyEntriesFromArray(returnObject.notizen);
    return returnObject;
  }


/**
 * 
 * @param {*} tablesParsed 
 * @param {*} content 
 */
function recognizeTableContent(tablesParsed,content){
    var returnObject = {};
    for(var i=0;i<tablesParsed.length;i++){
        var tableToCheck = tablesParsed[i];
        if(!tableToCheck[0]) continue;
        var firstItemHtml = tableToCheck[0][0].toLowerCase().trim();
        var firstItem = utils.htmlText2Text(tableToCheck[0][0].toLowerCase()).trim();
        //console.log("FIRSTITEM",firstItem);
        //console.log("FIRSTITEMHTML",firstItemHtml);
        if(content ==="kapitalentwicklung"){
            returnObject = recognizeKurseContent(returnObject,firstItem,firstItemHtml,i);
        }
    }
    return returnObject;
}
function recognizeKurseContent(returnObject,item,itemHTML,i){
    if(item.indexOf("grundkapital")!=-1 && itemHTML.indexOf("<b>")!=-1){
        returnObject.grundkapitalIndex = i;
        return returnObject;
    }      
    var numMatch = regLib.matchYear(item);
    if(numMatch && numMatch.length >=1  && itemHTML.indexOf("<b>")!=-1){
        if(!returnObject.kapitalEntwicklungIndex && returnObject.kapitalEntwicklungIndex!=0){
            returnObject.kapitalEntwicklungIndex = i;
            return returnObject;
        }
    }
    
    if(item.indexOf("genehmigtes")!=-1  && itemHTML.indexOf("<b>")!=-1 && item.indexOf("genu")==-1){
        returnObject.genehmKapitalIndex = i;
        return returnObject;
    }

    if(item.indexOf("genehmigtes")!=-1  && itemHTML.indexOf("<b>")!=-1 && item.indexOf("genu")!=-1){
        returnObject.genehmGenusKapitalIndex = i;
        return returnObject;
    }

    if(item.indexOf("derzeitiges")!=-1  && itemHTML.indexOf("<b>")!=-1 && item.indexOf("genu")!=-1){
        returnObject.derzeitigesGenusKapitalIndex = i;
        return returnObject;
    }

    if(item.indexOf("entwicklung")!=-1  && itemHTML.indexOf("genu")!=-1 && item.indexOf("kapital")!=-1 && itemHTML.indexOf("<b>")!=-1){
        returnObject.entwicklungGenusKapitalIndex = i;
        return returnObject;
    }
 
    if(item.indexOf("genehmigtes")!=-1  && itemHTML.indexOf("<b>")!=-1 && item.indexOf("genu")!=-1){
        returnObject.genehmGenusKapitalIndex = i;
        return returnObject;
    }

    if(item.indexOf("bedingtes")!=-1  && itemHTML.indexOf("<b>")!=-1){
        if(returnObject.bedingKapitalIndex){
            returnObject.bedingKapitalIndex2 = i; 

        }else{
            returnObject.bedingKapitalIndex = i;
        }
        return returnObject;
    }
    if(item.indexOf("bezugsrechte")!=-1  && itemHTML.indexOf("<b>")!=-1){
        returnObject.besBezugsrechteIndex = i;
        return returnObject;
    }
    if(item.indexOf("ermächtigung")!=-1 && itemHTML.indexOf("<b>")!=-1){
        returnObject.ermaechtigungAktienErwerbIndex = i;
        return returnObject;
    }
    if(item.indexOf("ausgegebenes")!=-1 && itemHTML.indexOf("<b>")!=-1){
        returnObject.ausgegebenesKapitalIndex = i;
        return returnObject;
    }
    return returnObject;
}

/**
 * Push an item to the specified returnObject (attach content to identifier property) and return the modified Object ,
 * when the item in the above row in the table specified by the identifier has a year, the year gets copied to the current
 * table.
 * @param {string} identifier property identifier where the item should be attached, should lead to an array in returnObject 
 * @param {object} itemToPush this content gets pushed to the returnobject
 * @param {object} returnObject modified object with itemToPush attached 
 * @param {int} rowIndex index of the current row at array identified by array 
 * @returns returnobject {object} modified object
 */
function pushItemToReturnObject(identifier,itemToPush,returnObject,rowIndex){
    if(!returnObject[identifier]){
        returnObject[identifier] = []; //Create new array at identifier if it doesnt exist 
    }
    if(!utils.isObjectEmpty(itemToPush)){ //also push empty objects ... because of indexing ... clear later
        if(!itemToPush.jahr){
            //Special case, the year was defined in the table above this item
            //content get's assigned to the content from the above item
            
            if(returnObject[identifier][rowIndex-1]){
                for(key in itemToPush){   
                    if (itemToPush.hasOwnProperty(key)) {     
                        
                        if(itemToPush[key]){
                            returnObject[identifier][rowIndex-1][key] = itemToPush[key];
                        }
                    }
                }
            }else{
                try{
                    if(itemToPush && itemToPush.jahr===""){
                        var checkYear = returnObject[Object.keys(returnObject)[0]][rowIndex-1].jahr; 
                        itemToPush.jahr = checkYear; 
                        returnObject[identifier].push(itemToPush);                        
                    }
                }catch(ex){
                    
                    debugger;
                    itemToPush.jahr = ""; 
                    returnObject[identifier].push(itemToPush);                        

                }
            }
        }else{
            //Standard case, there is a year in the item recognized 
            returnObject[identifier].push(itemToPush);
        }
    }else{
        //Just push empty object, because of indexing .... will be terminated later again
        returnObject[identifier].push(itemToPush);
    }
    return returnObject;
}

/**
 * Writes content of a single table column to the correct categories in in an object which gets
 * returned then 
 * @param {array} currentColumn table column contents of one column as an arra as an array 
 * @param {array} itemIndicesGroups indices as an array which map the column index to a category in recognzied content 
 */
function parseColumnContentToItem(currentColumn,itemIndicesGroups){
    var itemToFill = {};
    var itemsToFill = []; 
    //TODO Clarify how this works for multi item columns 
    for(var x=0;x<currentColumn.length;x++){
        var currentItem = currentColumn[x];
        var currentItemTextLC = utils.htmlText2Text(currentItem).trim().toLowerCase();
        if(!currentItemTextLC) continue;
            //if(currentItemTextLC=="6 884")debugger;   
            for(var n=0;n<itemIndicesGroups.length;n++){ //For all groups in this table
                itemToFill = assignIndicesToObject(itemToFill,x,itemIndicesGroups[n],currentItemTextLC);
                var itemsTemp = assignIndicesToObject(itemToFill,x,itemIndicesGroups[n],currentItemTextLC);
                itemsToFill.push(itemsTemp);
            }
    }
    return itemToFill;
}

/**
 * Get content of a whole column. And assign it to the corresponding row headers
 * 
 * @param {array} currentColumn - contains the content to parse  
 * @param {array} itemIndicesGroups - contains information which assigns row-indices to row headers
 * @param {object} object which contains assigned headers and data
 */
function parseColumnContentToItemKennzahlen(currentColumn,itemIndicesGroups){
    var returnObject = {};

    var itemsToFill = []; 
    //TODO Clarify how this works for multi item columns 
    for(var n=0;n<itemIndicesGroups.length;n++){
        var currentGroup = itemIndicesGroups[n];
        var colitem ={};
        for(var x=0;x<currentColumn.length;x++){
            var currentItem = currentColumn[x];
            var currentItemTextLC = utils.htmlText2Text(currentItem).trim().toLowerCase();
            if(!currentItemTextLC) continue;
             colitem = assignIndicesToObject(colitem,x,currentGroup,currentItemTextLC);
        }
        if(!utils.isObjectEmpty(colitem)){
            if(!returnObject[currentGroup.kopfzeile]){
                returnObject[currentGroup.kopfzeile] = [];
            }
            returnObject[currentGroup.kopfzeile].push(colitem);

        }
     }
    
    return returnObject;
}



/**
 * Assigns a defined value to the item, if the index matches an index in the array
 * @param {object} item content which might be changed 
 * @param {integer} index the current index to check on in the indices array 
 * @param {array} indicesArray contains information, which key is at which position
 * @param {string} value value which gets assigned to indices array
 * @param {string} (optional) additionalKey is used for sublevel assignments, in recursive calls of this
 * 
 * @return item with additional key and value pairs from indices array if there was a match 
 */
function assignIndicesToObject(item,index,indicesArray,value,additionalKey){
        
    for(key in indicesArray){   
        if (indicesArray.hasOwnProperty(key)) {

            var arrayval = indicesArray[key];
 
            if(typeof arrayval ==="object"){
                //Arrayval is not a number so it must be subitem 
                item = assignIndicesToObject(item,index,arrayval,value,key);

            }else if (typeof arrayval ==="number"){
                //Arrayval is number, so just assign key
                if(index==arrayval){
                    if(additionalKey){
                        if(!item[additionalKey]) item[additionalKey] = {};
                        if(arrayval>=0){
                            item[additionalKey][key] = value;
                        }else{
                            debugger;
                        }
                    }else{
                        if(arrayval>=0){
                            item[key]= value;
                        }else{
                            debugger;
                        }
                    }

                }
            }
        }
    }

    return item;
}


/**
 * Get Stückelung from a defined line 
 * @param {string} line - input line string
 * @param {boolean} specialmode (default: false) - in specialmode 'elung:' is used as detector otherwis ':' 
 */
function getStückelung(line,specialmode=false){
    var stückelung=null;
    if(/Stückelung/i.test(line)){
        var splitter;
        if(specialmode){
            splitter = "elung:";
        }else{
            splitter = ":";
        }
        var clsplit = line.split(splitter);
        if(clsplit[1]){
            stückelung = clsplit[1];
        }
    }

    if(specialmode && stückelung){
        //Filter out everything followed by "Stimmrecht:"
        var splitter2 = "Stimmrecht:";
        var clsplit2 = stückelung.split(splitter2);
        stückelung = clsplit2[0].trim();
    }
    
    //Filter out 'Stückelung' without ':' 
    if(stückelung){
        var stueckelungEndSplit = stückelung.split(/Stückelung/i);
        if(stueckelungEndSplit && stueckelungEndSplit.length>=2){
            stückelung = stueckelungEndSplit[1];
        }
        stückelung = stückelung.trim();
    }
    
    return stückelung;
}

/**
 * Get Stimmrecht from a defined line 
 * @param {string} line - input line string
 * @param {boolean} specialmode (default: false) - in specialmode 'immrecht:' is used as detector otherwis ':' 
 */
function getStimmrecht(line,specialmode=false){
    var stimmrecht=null;
    if(/Stimmrecht/i.test(line)){
        var splitter;
        if(specialmode){
            splitter = "immrecht:"
        }else{
            splitter = ":"
        }
        var clsplit = line.split(splitter);
        
        
        if(clsplit && clsplit.length>=2){
            stimmrecht = clsplit[1];
        }else{
            stimmrecht = clsplit[0];            
        }
    }
    if(specialmode && stimmrecht){
        //Filter out everything followed by "Stimmrecht:"
        var splitter2 = "Stimmrecht:";
        var clsplit2 = stimmrecht.split(splitter2);
        stimmrecht = clsplit2[0].trim();
    }

    if(stimmrecht){
        if(stimmrecht.trim().indexOf("tückelung:")!=-1){
            stimmrecht = null; 
        }
    }

    return stimmrecht;
}

//"Stimmrecht der Aktien:"
/**
 * Get the following restlines respecting the infos object, checks in the infos object
 * For the related table, if there is a rest following the stopindex of the table
 * Returns the rest as array of lines seperated by the given seperator 
 * @param {object} relatedInfo information object of the current table with start and stop indices 
 * @param {object} rest object with indices of rest lines as keys and the lines themselves as values
 * @param {string} seperator seperator string which is used to split the rest in parts
 * @returns array of lines from rest which has been found, or null if nothing found
 */
function getRestLines(relatedInfo,rest,seperator,nextInfo){
        var stopIndex = relatedInfo.indexStop;
        var restEndIndex;
        if(nextInfo){
            restEndIndex = nextInfo.indexStart; //if there is a follow-up table 
        }else{
            restEndIndex = null;
        }

        var restStartIndex = stopIndex+1; 
        var restBlob="";
         
        for (var key in rest) {
            if (rest.hasOwnProperty(key)) {
                //console.log(key + " -> " + rest[key]);
                var keynum =  parseInt(key) ; //cast key as number 
                if(isNaN(keynum)) continue;
                if(restEndIndex){ //if rest is limited 
                    if( keynum >= restStartIndex && keynum < restEndIndex){
                        restBlob = restBlob + seperator +  rest[key]
                    }
                    /* JS: No good idea, json object order is not guaranteed
                    if(keynum >= restEndIndex){
                        break; //End loop if rest is limited
                    }
                    */
                }else{
                    if(keynum >= restStartIndex){
                        //Just add everything
                        restBlob = restBlob + seperator+ rest[key];
                    }
                }
            }
        }

        //Split array with seperator and return
        if(restBlob){
            var restBsplit = restBlob.split(seperator);
            return restBsplit;
        }else{
            return null;
        }

}

/**
 * Get the next bigger index within 'tablesIndices' to 'currentIndex' 
 * @param {object} tablesIndices - indicesKeys with corresponding indce numbers 
 * @param {integer} currentIndex - index to search successor
 * @returns {integer} next bigger index, if nothing found return 'undefined'
 */
function getNextIndex(tablesIndices,currentIndex){    
    for(var key in tablesIndices){
        if(tablesIndices.hasOwnProperty(key)){
            var index = tablesIndices[key];
            if(index>currentIndex) return index; //Return first key found 
        }
    }
}

module.exports = {
    recognizeTableArrays, 
    createParsedTables,
    parse_kapitalEntwicklung,
    parse_genehmKapital,
    parse_grundkapital,
    parse_bereinigtekurse,
    parse_dividenden,
    parse_ergebnisabfuehrung,
    parse_kennzahlen,
    parse_bedingKapital,
    parse_besBezugsrechte,
    parse_ermAktienerwerb,
    parse_aus_bilanzen,
    parse_aus_gewinn_und_verlustrechnungen,
    parse_ausgegebenesKapital,
    parse_entwicklungGenusKapital,
    recognizeTableContent, 
    getNextIndex
}