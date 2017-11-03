/**
 * parser_additions.js
 * 
 * Some additional functionalties which didn't fit in parser.js, 
 * but serve the same functionality as the matching functions on that layer.
 */

//External module requirements
var cheerio             = require('cheerio'); 
var cheeriotableparser  = require('cheerio-tableparser'); 
var fs                = require('fs');

//Internal module requirements
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

/**
 * This is here because it's recursively called and recursive calls are complicated 
 * from the matching-class in parser.js, this function calls itself with new table,
 * when the first table is not related to the actual content in ergebnisabfuehrung
 * parses ergebnisabführung 
 * @param {array} lines - string array of lines with the content to parse 
 * @param {integer} i   - current counter with the content 
 * @param {object} callCounter - measurement object for counting calls 
 * @param {object} _checkInfo  - object for call measurement
 * @param {boolean} recursively - the function calls itself recursively, in case the first table isn't a content table
 * @returns {integer} incremented start index
 */
function parseErgebnisAbfuehrung(lines,i,ret,callCounter,_checkInfo,recursively=false){
    var originline = i;     
    i = i+1; 
    var currentline = lines[i];

    var linesAcc=""; 
    
    var linesErgebnisabfuehrung =[]; //Lines related to Bereinigte Kurse 
    do{
        if(currentline && currentline.trim()!=""){
            linesErgebnisabfuehrung.push(currentline);
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

        //Note to loop, loop goes on if no current line defined, ends when end string found
    }while(!currentLineDefined||(end==-1 && end2==-1 && end3==-1 && end4==-1 && end5==-1)) 
    
    //Recognize if there is a table start tag in the lines, sometimes it's missing, cause it's in dividenden 
    var tableStartIsThere = false; 
    for(var x=0;x<linesErgebnisabfuehrung.length;x++){
        var currentLe = linesErgebnisabfuehrung[x];
        if(currentLe && currentLe.indexOf("<table")!=-1) tableStartIsThere = true; 
    }


    //If the table start tag is missing, fiddle in a new one 
    if(!tableStartIsThere){
        //Find actual table start
        var isearch = originline;  
        var clineTable="";
        while(!clineTable || clineTable.indexOf("<table")==-1){
            clineTable = lines[isearch];
            isearch = isearch-1;
        }
        //Call function again with new parameters
        return parseErgebnisAbfuehrung(lines,isearch,ret,callCounter,_checkInfo,true);
     }

    var returnobject = parser_tables.recognizeTableArrays(linesErgebnisabfuehrung);
    var tablesArr = returnobject.tablesArr;
    var rest      = returnobject.rest;
    var infos     = returnobject.infos;

    var tablesParsed = parser_tables.createParsedTables(tablesArr); 
     
    //Get the call count of boersenbewertung, to assign it to the current item 
    var currentCallCount = callCounter.getCurrentCount(cfw.config.checkfile_ergebnisabfuehrung);
    if(!currentCallCount)currentCallCount = 1;
    var retErgebnisabfuehrung = parser_tables.parse_ergebnisabfuehrung(tablesParsed,tablesArr,rest,infos,currentCallCount,recursively);

    cfw.writeToCheckfile(originline,JSON.stringify(tablesArr, null, " "),JSON.stringify(retErgebnisabfuehrung, null, " "),cfw.config.checkfile_ergebnisabfuehrung,cfw.config.checkfile_ergebnisabfuehrung_enabled);
    
    if(!ret.boersenbewertung) ret.boersenbewertung = {};
                            
    Object.assign(ret.boersenbewertung["boersenbewertung"+currentCallCount], retErgebnisabfuehrung);
     
    _checkInfo('Ergebnisabführung',originline, i, lines);
    return i-2;   
}
module.exports = {
    parseErgebnisAbfuehrung

}