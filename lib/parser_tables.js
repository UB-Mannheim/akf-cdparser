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
        //3rd argument: true  -> use textMode: 
        var data =  $("table").parsetable(false,false,true);
        tablesParsed.push(data);
    }
    return tablesParsed;
}
/**
 * Parses the first array of tables parsed in to a kapitalentwicklung object
 * @param {array} tablesParsed 
 * @returns kapitalentwicklung
 */
function parse_kapitalEntwicklung(tablesParsed){
    var returnObjects = [];
    function objectKapitalentwicklung(){
        this.jahr;
        this.betrag;
        this.text;
    }

    var cObject_kapitalEntw; 
    var table_kapitalEntwicklung = tablesParsed[0];


    for(var i=0;i<table_kapitalEntwicklung[0].length;i++){
        var maybeYear = table_kapitalEntwicklung[0][i].trim();
        if(maybeYear!==""){            
            //This must be a year 
            var numMatch = regLib.matchNumber(maybeYear);
            if(numMatch && numMatch.length>=1){
                if(i>0){
                     returnObjects.push(cObject_kapitalEntw); //Push intermediate objects
                }
                cObject_kapitalEntw = new objectKapitalentwicklung();
                cObject_kapitalEntw.jahr = maybeYear;
            } 
        } 
        var maybeText =table_kapitalEntwicklung[1][i].trim();       
        if(maybeText!==""){
            if(!cObject_kapitalEntw.text){
                cObject_kapitalEntw.text = [];
            }
            cObject_kapitalEntw.text.push( maybeText);
        }
        
        var maybeBetrag =table_kapitalEntwicklung[2][i].trim();       
        if(maybeBetrag!==""){
            cObject_kapitalEntw.betrag = maybeBetrag;
        }
    }
    returnObjects.push(cObject_kapitalEntw); //Push the last object
    //Delete empty objects
    returnObjects = utils.removeEmptyEntriesFromArray(returnObjects);
    return returnObjects;
}

function parse_grundkapital(tablesParsed,tablesArr,rest,infos){
    var tableGrundkapital = tablesParsed[1];    //Table for 'Grundkapital'
    var tableGenehmkapital = tablesParsed[2];   //Table for 'Genehmigtes Kapital'
    var tableBedingkapital = tablesParsed[3];   //Table for 'Bedingtes Kapital' 
    var tableBesBezRechte = tablesParsed[4];    //Table for 'Besondere Bezugsrechte'
    
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
        grundkapital.betrag = tableGrundkapital[1][0];
        //If there is a corresponding info object check
        if(infos[1]){
            var restlines = getRestLines(infos[1],rest,"<br>");
            if(restlines && restlines.length){
                for(var i=0;i<restlines.length;i++){
                    var currentline = restlines[i].trim();
                    
                    if(!currentline) continue;

                    var maybeStückelung = getStückelung(currentline);  
                    if(maybeStückelung){ //if stückelung is found...assign
                        stückelung = maybeStückelung;
                        continue;
                    }
                    var maybeStimmrecht = getStimmrecht(currentline);
                    if(maybeStimmrecht){
                        stimmrecht = maybeStimmrecht;
                        continue;
                    }
                    //else ... 
                    grundkapital.bemerkung = grundkapital.bemerkung+" "+ currentline;
                }
            }
        }
    }
    grundkapital.bemerkung = grundkapital.bemerkung.trim();

    if(grundkapital.bemerkung !="" || grundkapital.betrag !=""){
        returnobject.grundkapital = grundkapital;
        
    }

    if(stimmrecht) returnobject.stimmrecht = stimmrecht;
    if(stückelung) returnobject.stückelung = stückelung;
    
    return returnobject;
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
function getRestLines(relatedInfo,rest,seperator){
        var stopIndex = relatedInfo.indexStop;
        var restIndex = stopIndex+1; 
        var restBlob  = rest[restIndex]; 
        var restBsplit=null;

        if(restBlob){
            restBsplit = restBlob.split(seperator);
        }

        return restBsplit;
}

module.exports = {
    recognizeTableArrays, 
    createParsedTables,
    parse_kapitalEntwicklung,
    parse_grundkapital
}