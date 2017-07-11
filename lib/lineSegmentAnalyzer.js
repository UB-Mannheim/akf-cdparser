var regLib       = require('./regexLib');
var fs           = require('fs');
var Excel        = require('exceljs');

/** 
*  Analyzes a set of lines and gives a recommendations which seperators can be used 
*/

/**
 * TODO/IDEAS
 * - refactor redundant code in function 'analyze' -> make code more generic 
 * 
 */

const SEGMENT_NUM = 10;   //Number of segments in sectorsHolder 
const GROUPING_RANGE = 1; //Positive and Negative range for grouping around a maximum index, Grouping range of 1 produces maximum size groups of 3, range 2 maxsize groups of 5 etc
const PRINT_FILENAME ="./LineSegmentAnalysis_PRINTOUT";
const PRINT_ENDING   =".xlsx";
var   PRINT_NAME;      //Additional name information for the file which gets printed out 


var setOfLines = [];
var _setToAnalyze;  //Accumulated dataset which is analyzed with 'anaylze' function
var _sectorsHolder; //Dataset after analysis, can be also grouped through: doGrouping

//Struct like data-holder for element types 
const elementTypes = { 
    specialcharacter: "specialcharacter",   //,+$% or similar special characters  
    whitespace: "whitespace",               
    word: "word",                           //Group of characters known as word 
    number: "number",                       //Number with or without decimals 
    inBrackets: "inBrackets",                //Content in brackets 
    notAssigned: "notAssigned"                 //Placeholder for not assigned values 
}


//Class for creating a classified element 
function classifiedElement(){
    this.type = elementTypes.notAssigned,
    this.linePosition_characters= [-1,-1], //Position in original string in character-length [start,end]
    this.linePosition_segments= -1,        //Position in segments after element-segmentation
    this.sectorPosition= -1,               //Position in field of normalized sectors 
    this.content=""                        //The actual content as a string 
    this.lineIndex = -1;                   //Index in field of lines 
}

//Class which represents the combination of classified elements for one line + additional information  
function lineElement(){
    this.line_length = -1,         //length of original line 
    this.line        = -1,         //original line itsel 
    this.line_position = -1,       //position of the original line in original set  
    this.classifiedElements  = []; //The set of classfied elements 
}

//Class represents the whole set to analyze 
function setToAnalyze(){
    this.set_length = -1,
    this.set_name ="",      //Can be a category like aufsichtsrat or something 
    this.lineElements = []  
} 
 
 /**
  * Occurence of certain content in a sector 
  */
function sectorOccurence(){
    this.ctr= 1,                              //number of occurences of the content
    this.content= [],                       
    this.groupingChecked= false,              //this element was checked by grouping algorithm
    this.isGroup =false,                       //this item is a group of multiple occurences defined in grouping postprocessing
    this.groupSize = 0                         //Size of origin items (only used if isGroup==true)
}; 



function addLineToSet(line){
    setOfLines.push(line);
}

function addLineArrayToSet(linearray){
    if(!linearray)return;
    for(var i=0;i<linearray.length;i++){
        addLineToSet(linearray[i]);
    }
}

function deleteSetOfLines(){
    setOfLines=[];
}

function createLocalDataset(options){
    _setToAnalyze = new setToAnalyze();
    if(options){
        if(options.name){
            _setToAnalyze.set_name = options.name;  
        }
    }

    var seperatorSign = "¦";
    var lineElements=[];

    for(var i=0;i<setOfLines.length;i++){
        var currentline           = setOfLines[i];
        var currentline_numchars  = currentline.length;

        console.log("CURLINE",currentline);


        if(!currentline || currentline==="") continue; 
        var currentlineWithSeperators=currentline;
        var currentlineForPosition   =currentline; //This is just a helper string for getting the absolute position of matches 

        //Substitute matches within parenthesis with indices in the string         
        var matchBracketsRegex = new RegExp(/\(.*\)/g);
        var matchBrackets = currentlineWithSeperators.match(matchBracketsRegex);
        var matchBracketsIndices = [];
        
        if(matchBrackets && matchBrackets.length>=1){
            for(var x=0;x<matchBrackets.length;x++){
                var replacement = seperatorSign+"matchBrackets"+seperatorSign;
                currentlineWithSeperators = currentlineWithSeperators.replace(matchBrackets[x],replacement);
            }
            //Find indices - this matches only single entries even if global regex, therefore has to be repeated 
            while (match= matchBracketsRegex.exec(currentlineForPosition)){
                if(!match){
                    debugger;     
                    throw "This shouldn't happen"
                }
                var replacementForPosition = createSeriesOfCharacter(seperatorSign,match[0].length); 
                currentlineForPosition = currentlineForPosition.replace(match[0],replacementForPosition);     
                matchBracketsIndices.push([match.index, match.index+match[0].length]);
            }
            if(matchBrackets.length != matchBracketsIndices.length){
                debugger; //Also shouldn't happen 
            }
        }

        //Substitute matches which have numbers (not in parenthesis) in the string
        var matchNumberNotInBrackets = regLib.matchNumber(currentlineWithSeperators);
        var matchNumberNotInBracketsRegex = regLib.matchNumber(null,true); //return the used regex 
        var matchNumberNotInBracketsIndices = [];

        if(matchNumberNotInBrackets && matchNumberNotInBrackets.length){
            for(var x=0;x<matchNumberNotInBrackets.length;x++){
                var replacement = seperatorSign+"matchNumberNotInBrackets"+seperatorSign;
                currentlineWithSeperators = currentlineWithSeperators.replace(matchNumberNotInBrackets[x],replacement);
            }
        
            for(var x=0;x<matchNumberNotInBrackets.length;x++){
                currentlineWithSeperators = currentlineWithSeperators.replace("matchNumberNotInBrackets","matchNumberNotInBracketz"+x);
            }

            //Find indices - this matches only single entries even if global regex, therefore has to be repeated 
            while (match= matchNumberNotInBracketsRegex.exec(currentlineForPosition)){
                if(!match){
                    debugger;     
                    throw "This shouldn't happen"
                }
                var replacementForPosition = createSeriesOfCharacter(seperatorSign,match[0].length); 
                currentlineForPosition = currentlineForPosition.replace(match[0],replacementForPosition);     
                matchNumberNotInBracketsIndices.push([match.index, match.index+match[0].length]);
            }
        }

        //Matches all characters except numbers, alphabet and seperator sign 
        var specialCharactersRegex = new RegExp("[^a-zA-Z0-9_."+seperatorSign+"]+","g"); 
        var matchSpecialCharacters = currentlineWithSeperators.match(specialCharactersRegex); 
        var matchSpecialCharactersIndices = [];


        if(matchSpecialCharacters && matchSpecialCharacters.length){
            for(var x=0;x<matchSpecialCharacters.length;x++){
                var replacement = seperatorSign+"matchSpecialCharacters"+x+seperatorSign;
                currentlineWithSeperators = currentlineWithSeperators.replace(matchSpecialCharacters[x],replacement);
            }


            //Find indices - this matches only single entries even if global regex, therefore has to be repeated 
            while (match= specialCharactersRegex.exec(currentlineForPosition)){
                if(!match){
                    debugger;     
                    throw "This shouldn't happen"
                }
                var replacementForPosition = createSeriesOfCharacter(seperatorSign,match[0].length); 
                currentlineForPosition = currentlineForPosition.replace(match[0],replacementForPosition);     
                matchSpecialCharactersIndices.push([match.index, match.index+match[0].length]);
            }
        }

        //TODO Indices for words 


        //2008:     Aufsichtsräten 
        //{BLOCK,BLOCK:(BLOCK)} 
        //{BLOCK,BLOCK:(BLOCK)} 
        var finalLineSplit = []; 

        var splitRegex = new RegExp(seperatorSign+"+","g"); 
        var currentlineSplit = currentlineWithSeperators.split(splitRegex); //SPlit besser 
        var bracketsMatchIndex = 0; 

        for(var x=0;x<currentlineSplit.length;x++){
            var splititem = currentlineSplit[x];

            if(!splititem) continue;

            if(splititem.indexOf("matchBrackets")!=-1){

                var ce = new classifiedElement();
                ce.linePosition_segments = finalLineSplit.length;  
                ce.linePosition_characters =matchBracketsIndices[bracketsMatchIndex];
                ce.type = elementTypes.inBrackets;
                ce.content = matchBrackets[bracketsMatchIndex]; 
                ce.lineIndex = i; 

                finalLineSplit.push(ce);
                bracketsMatchIndex = bracketsMatchIndex+1; 

                
            }else if(splititem.indexOf("matchNumberNotInBracketz")!=-1){
                var numberMatch = regLib.matchNumber(splititem);
                if(numberMatch && numberMatch.length>=1){
                   var ce = new classifiedElement();
                   ce.linePosition_segments = finalLineSplit.length; 
                   ce.linePosition_characters = matchNumberNotInBracketsIndices[numberMatch[0]]; 
                   ce.type = elementTypes.number;
                   ce.content = matchNumberNotInBrackets[numberMatch[0]]; 
                   ce.lineIndex = i;                 
                   
                   finalLineSplit.push(ce);
                }
            }else if(splititem.indexOf("matchSpecialCharacters")!=-1){
                var numberMatch = regLib.matchNumber(splititem);
                if(numberMatch && numberMatch.length>=1){
                    var ce = new classifiedElement();
                   ce.linePosition_segments = finalLineSplit.length;  
                   ce.linePosition_characters = matchSpecialCharactersIndices[numberMatch[0]]; 
                   ce.type = elementTypes.specialcharacter;
                   ce.content = matchSpecialCharacters[numberMatch[0]]; 
                   ce.lineIndex = i; 
                   
                   finalLineSplit.push(ce);
                }
            }else{
                //Here the substitution only matches the first entry 
                var wordMatchRegex = new RegExp(splititem);
                var match = wordMatchRegex.exec(currentlineForPosition);
                if(!match){
                    debugger;     
                    throw "This shouldn't happen";
                }
                var replacementForPosition = createSeriesOfCharacter(seperatorSign,match[0].length); 
                currentlineForPosition = currentlineForPosition.replace(match[0],replacementForPosition);   
                var recognizedIndices =   [match.index, match.index+match[0].length];

                /*
                    if(!match){
                        debugger;     
                        throw "This shouldn't happen"
                    }
                    var replacementForPosition = createSeriesOfCharacter(seperatorSign,match[0].length); 
                    currentlineForPosition = currentlineForPosition.replace(match[0],replacementForPosition);     
                    matchSpecialCharactersIndices.push([match.index, match.index+match[0].length]);
                */

                var ce = new classifiedElement();
                ce.linePosition_segments = finalLineSplit.length;  
                ce.linePosition_characters = recognizedIndices;
                ce.type = elementTypes.word;
                ce.content = splititem; 
                ce.lineIndex = i;  
                finalLineSplit.push(ce);
            }
        }

        //Create a checkstring from found stuff 
        var checkstring=""; 
        for(var x=0;x<finalLineSplit.length;x++){
            checkstring = checkstring+finalLineSplit[x].content;
        }
        console.log("CHEKSTR",checkstring);


        //Add the string to a set of lines 
        var line_element =new lineElement();
        line_element.line          = currentline;
        line_element.line_length   = currentline_numchars;  
        line_element.classifiedElements = finalLineSplit;
        line_element.line_position = i; 
        
        lineElements.push(line_element); 
    }
    lineElements = sectorizeLineElements(lineElements); 
    _setToAnalyze.lineElements = lineElements;
}


function sectorizeLineElements(lineElements){
    for(var i=0;i<lineElements.length;i++){
        var currentElement = lineElements[i]; 
        if(!currentElement.classifiedElements){
            debugger; //shouldn't happen 
        }
        
        var maxNum_elements = currentElement.classifiedElements.length; 
        var factor = SEGMENT_NUM / maxNum_elements; 

        for(var x=0;x<currentElement.classifiedElements.length;x++){
            var classifiedElement = currentElement.classifiedElements[x];
            //Do calculation step with factor here 
            var sectorPosition         = factor * classifiedElement.linePosition_segments;
            var sectorPosition_rounded = Math.round(sectorPosition);
            if(sectorPosition_rounded==SEGMENT_NUM){
                //Catch cases when there is a rounding up where there is no space in array anymore
                sectorPosition_rounded = SEGMENT_NUM-1; 
            }
            classifiedElement.sectorPosition = sectorPosition_rounded;            
        }
    }
    return lineElements;
}




function analyzeDataset(){

    var sectorsHolder = new Array(SEGMENT_NUM);
    for(var i=0;i<sectorsHolder.length;i++){
        sectorsHolder[i] = {}; //Create empty objects 
    }
    //Count occurrences array 
    if(!_setToAnalyze.lineElements ||!_setToAnalyze.lineElements.length){
        console.log("Won't do anything, because localDataset doesn't exist");
        return;
    }
    for(var i=0;i<_setToAnalyze.lineElements.length;i++){
        //Foreach line in set to analyze 
        var current_lineElement = _setToAnalyze.lineElements[i];
        if(!current_lineElement.classifiedElements ||!current_lineElement.classifiedElements.length)
        {
            debugger; //Shouldn't happen
            continue; //Skip empty line 
        }
        for(var x=0;x<current_lineElement.classifiedElements.length;x++){
            var current_classfiedElement = current_lineElement.classifiedElements[x];
            var sectorPosition = current_classfiedElement.sectorPosition;

            var key;
            if(current_classfiedElement.type == elementTypes.number){
                var content = current_classfiedElement.content; 
                if(content.indexOf(".")!=-1){
                    key = "NUMBERDOT";
                }else if(content.indexOf(",")!=-1){
                    key = "NUMBERCOMMA";
                }else{
                    key = "NUMBER";
                }
            }else if(current_classfiedElement.type ==elementTypes.specialcharacter){
                key = current_classfiedElement.content.trim();
            }else if(current_classfiedElement.type == elementTypes.inBrackets){              
                key = "INBRACKETS";
            }else{
                key = current_classfiedElement.content;
            }

            if(!key){
                key= "WHITESPACE";
            }

            try{
                if(!sectorsHolder[sectorPosition][key]){
                    sectorsHolder[sectorPosition][key] = new sectorOccurence();
                    sectorsHolder[sectorPosition][key].content.push(current_classfiedElement.content);
                }else{
                    sectorsHolder[sectorPosition][key].ctr = sectorsHolder[sectorPosition][key].ctr+1;
                    sectorsHolder[sectorPosition][key].content.push(current_classfiedElement.content);
                }
            }catch(ex){
                debugger; //Shouldn't happen
                console.log(ex);
            }
        }

    }
    _sectorsHolder = sectorsHolder;
    console.log(" dataset was analyzed and saved in sectors holder")
}

function elementStreak(){
    this.startIndex= -1;
    this.stopIndex = -1; 
    this.maximumIndex = -1;
    this.maxCtr = -1;
    this.key = undefined;
    
    this.getStreakLength = function(){
        if(this.startIndex!=-1 && this.stopIndex!=-1){
            var length = this.stopIndex-this.startIndex+1;
            return length;
        }else{
            return null;
        }
    }
}


function doGrouping(){
    console.log("doGrouping");
    if(_sectorsHolder){
        console.log("Can't do grouping cause not analyzed dataset is there");
        return;
    }

    var elementStreaks =  [];   //Array for possible groups  
    
    //Find Element Streaks 
    for(var i=0;i<sectorsHolder.length;i++){
        var sector = sectorsHolder[i]; 
        for (var key in sector) {
            if (sector.hasOwnProperty(key)) {
                var startElement = sector[key];
                // do stuff
                if(!startElement.groupingChecked){
                    //Select element and do grouping 
                    var currentElement = startElement;
                    var currentElementIndex = i;
                    var startIndexSectorsHolder = i; 
                    var _elementStreak = new elementStreak();
                    var maximumFound = false;
                    _elementStreak.startIndex = i; 
                    _elementStreak.key = key; 
                    _elementStreak.maxCtr = currentElement.ctr;
                    _elementStreak.maximumIndex = i;
                   /*
                    if(key == ','){
                        console.log(streak);
                    }
                    */
                    //For the following sectors 
                    for(var v=startIndexSectorsHolder+1;v<sectorsHolder.length;v++){
                        var sectorToCompare = sectorsHolder[v];
                        //Search for element
                        var nextElement = sectorToCompare[key];
                        //Compare element occurences 
                        if(!nextElement){
                            currentElement.groupingChecked = true;
                            _elementStreak.stopIndex = currentElementIndex; //Previous element was the last element in streak
                            break;
                        }else if(nextElement.ctr == currentElement.ctr){
                            _elementStreak.stopIndex = v; //Take next element as stop index, because there is one
                        }else if(nextElement.ctr > currentElement.ctr){
                            _elementStreak.stopIndex = v; //Take next element as stop index, because there is one
                            if(maximumFound){
                                //If a maximum has been found an there is an increment again, the current element belongs to another group                                
                               currentElement.groupingChecked = true;
                               nextElement.groupingChecked = true;
                               break;
                            }
                        }else if(nextElement.ctr < currentElement.ctr){
                            if(currentElement.ctr>_elementStreak.maxCtr){
                                _elementStreak.maximumIndex = currentElementIndex;
                                _elementStreak.maxCtr = currentElement.ctr;
                                maximumFound = true;    //Indicates that a local maximum has now been found definetely
                            }
                            _elementStreak.stopIndex = v; //Take next element as stop index,because there is one

                        }
                        //mark currentElement as checked, so that it doesn't get checked in further iterations 
                        currentElement.groupingChecked = true;
                        //Set element for next loop iteration 
                        currentElement = nextElement;
                        currentElementIndex = v;
                    }
                    //Sometimes stop index is still -1, this fixes this circumstance 
                    if(_elementStreak.maximumIndex==sectorsHolder.length-1){
                        _elementStreak.stopIndex = sectorsHolder.length-1; 
                    }

                    elementStreaks.push(_elementStreak);

                }
            }
        }
    }

    //Create Groups from element streaks, then replace old single elements  with group elements in the sectorsHolder
    for(var i=0;i<elementStreaks.length;i++){
        var streak = elementStreaks[i];
        var streaklength = streak.getStreakLength();
        if(streaklength==null){
            debugger; 
            continue;
        }else if(streaklength==1){
            //A streak of one doesn't have to be grouped 
            continue;
        }
        //Extract items to group from the streak
        if(streak.key == "Marketing"){
            debugger;
        }
        //Determine start index of the group respective the grouping range 
        var startIndex =0;
        var startIndexpossible = streak.maximumIndex-GROUPING_RANGE;
 
        if(startIndexpossible<streak.startIndex){
            startIndex = streak.startIndex; //Respect the streak borders 
        }else{
            startIndex = startIndexpossible;
        }

        //Determine stop index of the group respective the grouping range
        var stopIndex =0;
        var stopIndexPossible = streak.maximumIndex + GROUPING_RANGE;

        if(stopIndexPossible > streak.stopIndex){ //Respect also the streak borders 
            stopIndex = streak.stopIndex;
        }else{
            stopIndex = stopIndexPossible;
        }

        //Group the items + delete the old parts of the group
        var groupedOccurence = new sectorOccurence();
        groupedOccurence.isGroup = true; 
        groupedOccurence.groupingChecked = true; 

        for(var x=startIndex;x<=stopIndex;x++){
            var item = sectorsHolder[x][streak.key];
            if(!item){
                debugger; //This shouldn't happen
            }
            groupedOccurence.ctr = groupedOccurence.ctr + item.ctr;
            groupedOccurence.groupSize = groupedOccurence.groupSize +1;
            //groupedOccurence.content.concat(item.content);
            Array.prototype.push.apply(groupedOccurence.content, item.content);
            //Tag old item delete
            delete sectorsHolder[x][streak.key]; 
        }

        if(groupedOccurence.groupSize <=1 ||groupedOccurence.groupSize > GROUPING_RANGE*2+1){
            //This shouldn't happen
            debugger;
        }
        //Add the new group to the final item
        sectorsHolder[streak.maximumIndex][streak.key] = groupedOccurence;

        /*
        if(streak.key == ','){
            console.log(streak);
            debugger; 
        }
        */

    }
    _sectorsHolder = sectorsHolder;
    console.log("sectorsHolder was grouped");
}

//TODO this can be transitioned to utils.js
function createSeriesOfCharacter(char,number){
    var series="";
    for(var i=0;i<number;i++){
        series = series + char; 
    }
    return series; 
}

/**
 * Print the dataset. 
 * @param {object} options ignoreWhitespaces ignores whitespaces in printout 
 */
function printDataset(options){
    if(options && options.printName){
        PRINT_NAME = options.printName;
    }
    createWorkbook(); //Create local excel workbook 
    fillExcelWithData(options.ignoreWhitespaces);
    writeToExcelFile();

}
var workbook;                   //The excel file variable which is holding the output for printing 
var sheetID = "MainSheet";      //The excel identifiel for the worksheet which is filled (there is only one atm)


function fillExcelWithData(ignoreWhitespaces){
    var worksheet = workbook.getWorksheet('MainSheet');
    var cols = [];
    /*
    worksheet.columns = [
        { header: 'Id', key: 'id', width: 10 },
        { header: 'Sector', key: 'name', width: 10 },
        { header: 'D.O.B.', key: 'DOB', width: 10}
    ];
    */

    //Generate Headers   
    for(var i=0;i<_sectorsHolder.length;i++){  
        var skey = generateSectorKey(i+1,1);
        cols.push( 
            { header: '..', key: skey, width: 16 }
        );
        skey = generateSectorKey(i+1,2);
        cols.push( 
            { header: 'Sektor'+i, key: skey, width: 8 }
        );     
        skey = generateSectorKey(i+1,3);
        cols.push( 
            { header: '..', key: skey, width: 3 }
        ); 
    }    

    worksheet.columns = cols;  
    //Generate Level 2 Headers 
    for(var i=0;i<_sectorsHolder.length;i++){  
        var skey = generateSectorKey(i+1,1);
        var borders; 
        borders = {left:true, bottom:true};
        editExcelCell("Character",worksheet,2,skey,borders);
        
        borders = {bottom:true}
        skey = generateSectorKey(i+1,2); 
        editExcelCell("Occurences",worksheet,2,skey,borders);

        borders = {right:true,bottom:true};
        skey = generateSectorKey(i+1,3);
        editExcelCell("Grouped",worksheet,2,skey,borders);
    }

    var startindexRows = 3;

    for(var i=0;i<_sectorsHolder.length;i++){
        var sortedColumn = generateSortedColumn(i);
        var rowIndex = 3; 
        for(var x=0;x<sortedColumn.length;x++){
            var currentItem = sortedColumn[x][0];
            var currentKey  = sortedColumn[x][2];
            var sectorKey = generateSectorKey(i+1,1);
            
            var borders; 
            if(ignoreWhitespaces && currentKey === "WHITESPACE"){
                continue;
            }   
            borders = {left:true};
            editExcelCell(currentKey,worksheet,rowIndex,sectorKey,borders);

        
            sectorKey = generateSectorKey(i+1,2);
            editExcelCell(currentItem.ctr,worksheet,rowIndex,sectorKey);

            borders = {right:true};
            sectorKey = generateSectorKey(i+1,3);
            var color;
            
            if(currentItem.isGroup){
                color = { argb: 'FF00FF00'};// for the graduate graphic designers... 
            }else{
                color = { argb: 'FFFF0000'};
            }

            editExcelCell(currentItem.isGroup,worksheet,rowIndex,sectorKey,borders,color);

            rowIndex=rowIndex+1;
        }

    }





    /*
    var currentColumn = worksheet.getColumn('s1p1');
    currentColumn.addLineToSet("Hallo");
    currentColumn.addLineArrayToSet(["Es","Sind","vier"]);
    */

    /*
    var sec1col = worksheet.getColumn(1);
    sec1col.header = 'Sector 1';
    */

    //worksheet.addRow({id: 1, name: 'John Doe', dob: new Date(1970,1,1)});
    //worksheet.addRow({id: 2, name: 'Jane Doe', dob: new Date(1965,1,7)});
}


/**
 * Sorts columns after value of ctr, gives back a sorted array which contains the objects of the column 
 * @param {integer} columnIndex 
 */
function generateSortedColumn(columnIndex){
    var sortable = [];
    //Push the column to a sortable array 
    for (var key in _sectorsHolder[columnIndex]) {
        sortable.push([_sectorsHolder[columnIndex][key],_sectorsHolder[columnIndex][key].ctr,key]);
    };
    //Sort column after value in 'ctr' which means occurences 
    sortable.sort(function(a, b) {
        return  b[1]-a[1];
    });

    return sortable;
}

/**
 * Edit a single cell on the excell sheet, defined in worksheet,
 * also draw cell borders borders if defined
 * @param {string} value    value assigned to the cell  
 * @param {object} worksheet  current worksheet used 
 * @param {*} rowNumber 
 * @param {*} columnID 
 * @param {object} borders if top,left,bottom or right are set to true in this object, a border is drawn at that position   
 * @param {object} color defines the colorvalue of the cell 
 */
function editExcelCell(value,worksheet,rowNumber,columnID,borders=null,color){
    var row = null;
    row = worksheet.getRow(rowNumber);  //Rows start with two 
    //row.getCell('s1p1').value = 1234;
    var cell = row.getCell(columnID)
    cell.value = value;
    if(borders!=null){
        cell.border = {};
        if(borders.top){
            cell.border.top = {style:'thin'};
        }
        if(borders.left){
            cell.border.left = {style:'thin'};
        }
        if(borders.bottom){
            cell.border.bottom = {style:'thin'};
        }
        if(borders.right){
            cell.border.right = {style:'thin'};
        }
    }
    if(color!=null){
        cell.fill = {
            type:    'pattern',
            pattern: 'solid',
            fgColor: color
        }
    }
    row.commit();
}
function generateSectorKey(sectorNumber,segmentNumber){
    return "s"+sectorNumber+"p"+segmentNumber;
}

function writeToExcelFile(){   
    if(!workbook){
        console.log("Workbook not defined, call createWorkbook() first");
        return;
    }
    var fullPrintname = PRINT_FILENAME+"_"+PRINT_NAME+PRINT_ENDING;
    workbook.xlsx.writeFile(fullPrintname)
    .then(function() {
        console.log("Data written to ",fullPrintname);
    });
}

function createWorkbook(){
    workbook = new Excel.Workbook();
    workbook.creator = 'lineSegmentAnalyzer';
    workbook.created = new Date();
    workbook.modified = new Date();
    sheet = workbook.addWorksheet(sheetID);
}


module.exports = {
    addLineToSet,
    addLineArrayToSet,
    deleteSetOfLines,
    createLocalDataset,
    analyzeDataset,
    doGrouping,
    printDataset
}
