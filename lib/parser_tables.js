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
        if(table_kapitalEntwicklung[1] && table_kapitalEntwicklung[1][i]){
            try{
            var maybeText =utils.htmlText2Text(table_kapitalEntwicklung[1][i]).trim();       
            if(maybeText!==""){
                if(!cObject_kapitalEntw.text){
                    cObject_kapitalEntw.text = [];
                }
                cObject_kapitalEntw.text.push(maybeText);
            }
            }catch(e){
                debugger;
            }
        }
        if(table_kapitalEntwicklung[2] && table_kapitalEntwicklung[2][i]){
            var maybeBetrag =utils.htmlText2Text(table_kapitalEntwicklung[2][i]).trim();       
            if(maybeBetrag!==""){             
                cObject_kapitalEntw.betrag = maybeBetrag;
            }
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


function parse_bedingKapital(tablesParsed,tablesArr,rest,infos,bedingKapitalIndex,nextTableIndex){
    var tableBedingkapital = tablesParsed[bedingKapitalIndex];   //Table for 'Genehmigtes Kapital'
    if(!tableBedingkapital){
        debugger; //Shouldn't happen
    }
    var returnobject = {}; 
    
    var bedingkapital = {
        betrag:null,
        bemerkung: "" 
    }
 
    //If the table has a valid header, check the table
    if(tableBedingkapital && tableBedingkapital[0][0].toLowerCase().indexOf("bedingtes")!=-1){ 
        if(!tableBedingkapital[1]){
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
                        bedingkapital.bemerkung = bedingkapital.bemerkung+" "+ clineText;

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
                        bedingkapital.bemerkung = bedingkapital.bemerkung+" "+ clineText;
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
                    bedingkapital.bemerkung = bedingkapital.bemerkung+" "+ clineText;
                }
            }
        }
        
    }
    bedingkapital.bemerkung = bedingkapital.bemerkung.trim();

    if(bedingkapital.bemerkung !="" || bedingkapital.betrag !=null){
        returnobject.bedingkapital = bedingkapital;       
    }
    
    return returnobject;
}

function parse_besBezugsrechte(tablesParsed,tablesArr,rest,infos,besBezugsrechteIndex,nextTableIndex){
    var tableBesondereBezugsrechte = tablesParsed[besBezugsrechteIndex];   //Table for 'Genehmigtes Kapital'
    if(!tableBesondereBezugsrechte){
        debugger; //Shouldn't happen
    }
    var returnobject = {}; 
    
    var besBezugsrechte = {
        jahre:[],
        bemerkungen: []
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
                        //Parse column one ..... 
                        var tcontent = followUpTable[0][i];
                        //TODO: this can be less redundant 
                        if(tcontent){
                            var currentlines = tcontent.split("<br>");
                            for(var x=0;x<currentlines.length;x++){
                                var currentline = currentlines[x];  
                                var clineText = utils.htmlText2Text(currentline).trim();
                                if(!clineText) continue;
                                besBezugsrechte.jahre.push(clineText);
                            }
                        }
                        //Parse column two ...... 
                        var tcontent2 = followUpTable[1][i];
                        //TODO: this can be less redundant 
                        if(tcontent2){
                            var currentlines2 = tcontent2.split("<br>");
                            for(var x=0;x<currentlines2.length;x++){
                                var currentline = currentlines2[x];  
                                var clineText = utils.htmlText2Text(currentline).trim();
                                if(!clineText) continue;
                                besBezugsrechte.bemerkungen.push(clineText);
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
                    //TODO: this can be less redundant 
                    if(tcontent){
                        var currentlines = tcontent.split("<br>");
                        for(var x=0;x<currentlines.length;x++){
                            var currentline = currentlines[x];  
                            var clineText = utils.htmlText2Text(currentline).trim();
                            if(!clineText) continue;
                            besBezugsrechte.jahre.push(clineText);
                        }
                    }
                    //Parse column two ...... 
                    var tcontent2 = tableBesondereBezugsrechte[1][i];
                    //TODO: this can be less redundant 
                    if(tcontent2){
                        var currentlines2 = tcontent2.split("<br>");
                        for(var x=0;x<currentlines2.length;x++){
                            var currentline = currentlines2[x];  
                            var clineText = utils.htmlText2Text(currentline).trim();
                            if(!clineText) continue;
                            besBezugsrechte.bemerkungen.push(clineText);
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
 
    if(besBezugsrechte.bemerkungen.length >=1 || besBezugsrechte.jahre.length >=1){
        returnobject.besBezugsrechte = besBezugsrechte;       
    }
    
    return returnobject;
}

function parse_ermAktienerwerb(tablesParsed,tablesArr,rest,infos,ermaechtigungAktienErwerbIndex,nextTableIndex){
    var tableAktienerwerb = tablesParsed[ermaechtigungAktienErwerbIndex];   //Table for 'Genehmigtes Kapital'
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

function parse_bereinigtekurse(tablesParsed,tablesArr,rest,infos){
    if(!tablesParsed ||tablesParsed.length>1){
        debugger; //check what's going on
    }
    var tableBereinigteKurse = tablesParsed[0];

    function kursitem(){
        this.jahr;
        this.kommentar;
        this.hoechst;
        this.tiefst; 
        this.ultimo;
    };

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
    var itemIndicesGroups =[];

    var returnObject = {
        kurse: [],
        notiz: null
    }; 

    var headerSplit = utils.htmlText2Text(rest[0]).split("Bereinigte Kurse");
    
    if(!headerSplit){
        debugger;
    }else if(headerSplit.length==1){       
        returnObject.notiz = regLib.removeParenthesis(headerSplit[0]).replace("Kurse","").trim();
    }else{
        returnObject.notiz = regLib.removeParenthesis(headerSplit[1]).trim();
    }
    
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
                }else if( nextItem && nextItem.indexOf("</b>")!=-1){
                    var nextItemTextLC = utils.htmlText2Text(nextItem).trim().toLowerCase();
                    if(currentItemIndices.jahr!=-1){
                        currentItemIndices.assignPossibleKommentar();
                        itemIndicesGroups.push(currentItemIndices);
                        currentItemIndices = new itemIndices();    
                    }  
                    currentItemIndices.jahr = x;
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

            for(var y=0;y<itemIndicesGroups.length;y++){
                var _kursitem = new kursitem();
                for(var x=0;x<currentColumn.length;x++){
                    var currentItem = currentColumn[x];
                    var currentItemTextLC = utils.htmlText2Text(currentItem).trim().toLowerCase();
                    if(!currentItemTextLC) continue;

                    switch(x){
                        case itemIndicesGroups[y].jahr:
                            _kursitem.jahr = currentItemTextLC;
                            break;
                        case itemIndicesGroups[y].kommentar:
                            _kursitem.kommentar = currentItemTextLC;
                            break;
                        case itemIndicesGroups[y].hoechst:
                            _kursitem.hoechst = currentItemTextLC;
                            break;
                        case itemIndicesGroups[y].tiefst:
                            _kursitem.tiefst = currentItemTextLC;
                            break;
                        case itemIndicesGroups[y].ultimo:
                            _kursitem.ultimo = currentItemTextLC;
                            break;                                      
                    }
                }
                if(!utils.isObjectEmpty(_kursitem)){
                    returnObject.kurse.push(_kursitem);
                }
            }
        }
    }

    return returnObject;
}

function recognizeTableContent(tablesParsed){
    var returnObject = {};
    for(var i=0;i<tablesParsed.length;i++){
        var tableToCheck = tablesParsed[i];
        if(!tableToCheck[0]) continue;
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
    parse_bereinigtekurse,
    parse_bedingKapital,
    parse_besBezugsrechte,
    parse_ermAktienerwerb,
    recognizeTableContent, 
    getNextIndex
}