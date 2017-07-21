var regLib              = require('./regexLib');
var cfw                 = require('./checkfileWriter');
var cheerio             = require('cheerio'); 
var cheeriotableparser  = require('cheerio-tableparser');
var regLib              = require('./regexLib');
var utils               = require('./utils');


/**
 * Parses an array of html-tables into an object which gives back the 
 * an array which indexes and identifies the strings which belong to a certain table
 * also gives a 'rest'-oject which is everything which is not in these tables which contains
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
 * @param {array of strings} tablesArr input array which contains strings of html tables
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
 * Parses the first array of tables parsed in to a kapitalentwicklung object
 * @param {array} tablesParsed 
 * @returns kapitalentwicklung
 */
function parse_kapitalEntwicklung(tablesParsed,tableKapitalEntw_index){
    var returnObjects = [];
    function objectKapitalentwicklung(){
        this.jahr;
        this.betrag;
        this.text;
    }

    var cObject_kapitalEntw; 
    var table_kapitalEntwicklung = tablesParsed[tableKapitalEntw_index];
    if(!table_kapitalEntwicklung){
        debugger; //This shouldn't happen 
    }

    for(var i=0;i<table_kapitalEntwicklung[0].length;i++){
        var maybeYear = utils.htmlText2Text(table_kapitalEntwicklung[0][i]).trim();
        if(maybeYear!==""){            
            //This must be a year 
            var numMatch = regLib.matchNumber(maybeYear);
            if(numMatch && numMatch.length>=1){
                if(i>0){
                     returnObjects.push(cObject_kapitalEntw); //Push intermediate objects
                }
                cObject_kapitalEntw = new objectKapitalentwicklung();
    
                cObject_kapitalEntw.jahr = utils.htmlText2Text(maybeYear);
            } 
        } 
        if(!cObject_kapitalEntw){
            continue;   //No valid first line found ... don't do other checks 
        }
        var maybeText =utils.htmlText2Text(table_kapitalEntwicklung[1][i]).trim();       
        if(maybeText!==""){
            if(!cObject_kapitalEntw.text){
                cObject_kapitalEntw.text = [];
            }
             cObject_kapitalEntw.text.push(maybeText);
        }
        
        var maybeBetrag =utils.htmlText2Text(table_kapitalEntwicklung[2][i]).trim();       
        if(maybeBetrag!==""){             
            cObject_kapitalEntw.betrag = maybeBetrag;
        }
    }
    returnObjects.push(cObject_kapitalEntw); //Push the last object
    //Delete empty objects
    returnObjects = utils.removeEmptyEntriesFromArray(returnObjects);
    return returnObjects;
}

function parse_genehmKapital(tablesParsed,tablesArr,rest,infos,genehmKapitalIndex,nextTableIndex){
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
    if(tableGenehmkapital && tableGenehmkapital[0][0].toLowerCase().indexOf("genehmigtes")!=-1){ 
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

            //If there are additional entries in the table 
            if(tableGenehmkapital[0] && tableGenehmkapital[0].length>1){
                for(var i=1;i<tableGenehmkapital[0].length;i++){
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

function parse_grundkapital(tablesParsed,tablesArr,rest,infos,tableGrundkapitalIndex){
    var tableGrundkapital = tablesParsed[tableGrundkapitalIndex];
     
    var returnobject = {}; 
    
    var grundkapital = {
        betrag:null,
        bemerkung: "" 
    }
    var stückelung; 
    var stimmrecht;

    //If the table has a valid header, check the table
    if(tableGrundkapital && tableGrundkapital[0][0].toLowerCase().indexOf("grundkapital")!=-1){ 
        //parse data
        grundkapital.betrag = utils.htmlText2Text(tableGrundkapital[1][0]);

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
                    
                    var maybeStückelung = getStückelung(clineText);  
                    if(maybeStückelung){ //if stückelung is found...assign
                        stückelung = maybeStückelung;
                        continue;
                    }
                    var maybeStimmrecht = getStimmrecht(clineText);
                    if(maybeStimmrecht){
                        stimmrecht = maybeStimmrecht;
                        continue;
                    }
                    //else ... 
                    grundkapital.bemerkung = grundkapital.bemerkung+" "+ clineText;
                }

            }
        }
        //If there is a corresponding info object check - this means there is information, but it's not in the table directly
        if(infos[tableGrundkapitalIndex]){
            var restlines = getRestLines(infos[tableGrundkapitalIndex],rest,"<br>",infos[tableGrundkapitalIndex+1]);
            if(restlines && restlines.length){
                for(var i=0;i<restlines.length;i++){
                    var currentline = restlines[i].trim();
                    var clineText = utils.htmlText2Text(currentline);

                    if(!clineText) continue;

                    var maybeStückelung = getStückelung(clineText);  
                    if(maybeStückelung){ //if stückelung is found...assign
                        stückelung = maybeStückelung;
                        continue;
                    }
                    var maybeStimmrecht = getStimmrecht(clineText);
                    if(maybeStimmrecht){
                        stimmrecht = maybeStimmrecht;
                        continue;
                    }
                    //else ... 
                    grundkapital.bemerkung = grundkapital.bemerkung+" "+ clineText;
                }
            }
        }
    }
    grundkapital.bemerkung = grundkapital.bemerkung.trim();

    if(grundkapital.bemerkung !="" || grundkapital.betrag !=null){
        returnobject.grundkapital = grundkapital;       
    }

    if(stimmrecht) returnobject.stimmrecht = stimmrecht;
    if(stückelung) returnobject.stückelung = stückelung;
    
    return returnobject;
}


function recognizeTableContent(tablesParsed){
    var returnObject = {};
    for(var i=0;i<tablesParsed.length;i++){
        var tableToCheck = tablesParsed[i];
        var firstItem = utils.htmlText2Text(tableToCheck[0][0].toLowerCase()).trim();
        if(firstItem.indexOf("grundkapital")!=-1){
            returnObject.grundkapitalIndex = i;
            continue;
        }
        
        var numMatch = regLib.matchYear(firstItem);
        if(numMatch && numMatch.length >=1){
            returnObject.kapitalEntwicklungIndex = i;
            continue;
        }
        if(firstItem.indexOf("genehmigtes")!=-1){
            returnObject.genehmKapitalIndex = i;
            continue;
        }
        if(firstItem.indexOf("bedingtes")!=-1){
            returnObject.bedingKapitalIndex = i;
            continue;
        }
        if(firstItem.indexOf("bezugsrechte")!=-1){
            returnObject.besBezugsrechteIndex = i;
            continue;
        }
        if(firstItem.indexOf("ermächtigung")!=-1){
            returnObject.ermaechtigungAktienErwerbIndex = i;
            continue;
        }

    }
    return returnObject;
 }
function getStückelung(line){
    var stückelung=null;
    if(/Stückelung/i.test(line)){
        var clsplit = line.split(':');
        if(clsplit[1]){
            stückelung = clsplit[1];
        }
    }
    return stückelung;
}

function getStimmrecht(line){
    var stimmrecht=null;
    if(/Stimmrecht/i.test(line)){
        var clsplit = line.split(':');
        if(clsplit[1]){
            stimmrecht = clsplit[1];
        }
    }
    return stimmrecht;
}


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
    recognizeTableContent, 
    getNextIndex
}