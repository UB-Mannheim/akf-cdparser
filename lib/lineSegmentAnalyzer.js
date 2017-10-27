/** 
*  Analyzes a set of lines and creates an excel sheet which gives recommendations 
*  which seperators can be used.
*/

//External dependancies
var fs           = require('fs');
var Excel        = require('exceljs');
//Own dependencies
var regLib       = require('./regexLib');
var utils        = require('./utils');

/**
 * TODO/IDEAS
 * - refactor redundant code in function 'analyze' -> make code more generic 
 * - better grouping algorithm, what happens with multi-item gradients which are not in range...they should be grouped in future
 * - group similar words in same sector and also over the sector-neighborhoods
 */

var   SEGMENT_NUM = 10;   //Number of segments in sectorsHolder 
var   GROUPING_RANGE = 1; //Positive and Negative range for grouping around a maximum index, Grouping range of 1 produces maximum size groups of 3, range 2 maxsize groups of 5 etc
const PRINT_FILENAME ="./LineSegmentAnalysis_PRINTOUT";
const PRINT_ENDING   =".xlsx";
var   PRINT_NAME;      //Additional name information for the file which gets printed out 
var   USE_ZUMSTEIN_VECTOR = false;   //Special configuration by Philipp Zumstein


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
    notAssigned: "notAssigned",                 //Placeholder for not assigned values 
    zumsteinVector: "zumsteinVector"            //Special characters string
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


/**
 * Push a line to the set to analyze. 
 * @param {string} line  text to push 
 */
function addLineToSet(line){
    setOfLines.push(line);
}

/**
 * Adds an array of multiple lines to set 
 * @param {array} linearray multiple strings to push 
 */
function addLineArrayToSet(linearray){
    if(!linearray)return;
    for(var i=0;i<linearray.length;i++){
        addLineToSet(linearray[i]);
    }
}

/**
 * Deletes the used set of lines from local storage.
 */
function deleteSetOfLines(){
    setOfLines=[];
}

/**
 * Create the local dataset which can be analyzed then,
 * creates a dataset of sectorized and classified elements which is linked to original content
 * which can then be interpreted in the analyze function
 * @param {object} options - define the options used 
 * @param {string} options.name - identificator, which defines the name the set is saved
 * @param {bool}   options.zumsteinVector - flag which indicates a special mode, where one segment is used and only special characters are analyzed
 */
function createLocalDataset(options){
    _setToAnalyze = new setToAnalyze();
    //Apply options
    if(options){
        if(options.name){
            _setToAnalyze.set_name = options.name;  
        }
        if(options.zumsteinVector){
            SEGMENT_NUM = 1;
            USE_ZUMSTEIN_VECTOR =  true;
        }else{
            USE_ZUMSTEIN_VECTOR = false;
        }
    }
    //divider element for recognized content types, should be a character not commonly used
    var seperatorSign = "¦"; 
    var lineElements=[];
    //Go through each line in set 
    for(var i=0;i<setOfLines.length;i++){
        var currentline           = setOfLines[i];
        var currentline_numchars  = currentline.length;

        if(!currentline || currentline==="") continue; 
        var currentlineWithSeperators=currentline;
        var currentlineForPosition   =currentline; //This is just a helper string for getting the absolute position of matches 

        //Substitute matches within parenthesis with indices in the string         
        var matchBracketsRegex = new RegExp(/\(.*\)/g);
        var matchBrackets = currentlineWithSeperators.match(matchBracketsRegex);
        var matchBracketsIndices = [];
        
        if(matchBrackets && matchBrackets.length>=1 && !USE_ZUMSTEIN_VECTOR){
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
                var replacementForPosition = utils.createSeriesOfCharacter(seperatorSign,match[0].length); 
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

        if(matchNumberNotInBrackets && matchNumberNotInBrackets.length && !USE_ZUMSTEIN_VECTOR){
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
                var replacementForPosition = utils.createSeriesOfCharacter(seperatorSign,match[0].length); 
                currentlineForPosition = currentlineForPosition.replace(match[0],replacementForPosition);     
                matchNumberNotInBracketsIndices.push([match.index, match.index+match[0].length]);
            }
        }

        //Matches all characters except numbers, alphabet and seperator sign 
        var specialCharactersRegex = new RegExp("[^a-zA-Z0-9üÜäÄöÖßé_."+seperatorSign+"]+","g"); 
        var matchSpecialCharacters = currentlineWithSeperators.match(specialCharactersRegex); 
        var matchSpecialCharactersIndices = [];


        if(matchSpecialCharacters && matchSpecialCharacters.length && !USE_ZUMSTEIN_VECTOR){
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
                var replacementForPosition = utils.createSeriesOfCharacter(seperatorSign,match[0].length); 
                currentlineForPosition = currentlineForPosition.replace(match[0],replacementForPosition);     
                matchSpecialCharactersIndices.push([match.index, match.index+match[0].length]);
            }
        }

        //Content  in currentlineWithSeperators is now classified into categories (example): 
        //"¦matchSpecialCharacters0¦table¦matchSpecialCharacters1¦width¦matchSpecialCharacters2¦¦matchNumberNotInBracketz0¦¦matchSpecialCharacters3¦"

        var finalLineSplit = []; 

        var zst_spcharstring="";
        if(USE_ZUMSTEIN_VECTOR){
            //Create a string out of all special characters
            for(x=0;x<matchSpecialCharacters.length;x++){                
                zst_spcharstring = zst_spcharstring + matchSpecialCharacters[x].trim(); //ATM ignores whitespaces
            }
            //Use this string as classified element
            var ce = new classifiedElement();
            ce.linePosition_segments = 0;  
            ce.linePosition_characters = 0;
            ce.type = elementTypes.zumsteinVector;
            ce.content = zst_spcharstring; 
            ce.lineIndex = i;  
            finalLineSplit.push(ce);
            //Which is then assigned to the current line element
            var line_element =new lineElement();
            line_element.line          = currentline;
            line_element.line_length   = currentline_numchars;  
            line_element.classifiedElements = finalLineSplit;
            line_element.line_position = i; 
            
            lineElements.push(line_element); 
            continue; //ignore the following lines of code
        }

        //2008:     Aufsichtsräten 
        //{BLOCK,BLOCK:(BLOCK)} 
        //{BLOCK,BLOCK:(BLOCK)} 

        //For each category create content elements, which contain type, position, category and actual content
        var splitRegex = new RegExp(seperatorSign+"+","g"); 
        var currentlineSplit = currentlineWithSeperators.split(splitRegex); //Split besser 
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
                var replacementForPosition = utils.createSeriesOfCharacter(seperatorSign,match[0].length); 
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

                continue;
            }
        }

        //Create a checkstring from found stuff
        /*
        var checkstring=""; 
        for(var x=0;x<finalLineSplit.length;x++){
            checkstring = checkstring+finalLineSplit[x].content;
        }
        */
        //console.log("CHEKSTR",checkstring);


        //Add the string to a set of lines 
        var line_element =new lineElement();
        line_element.line          = currentline;
        line_element.line_length   = currentline_numchars;  
        line_element.classifiedElements = finalLineSplit;
        line_element.line_position = i; 
        
        lineElements.push(line_element); 
    }
    lineElements = sectorizeLineElements(lineElements); 
    //Each line has now a set of sectorized and classified elements
    _setToAnalyze.lineElements = lineElements;
}

/**
 * Go trough each line and assign each element to a sector
 * sector is determined by the number of elements in a single line
 * and the wordposition of the element to assign within the line.
 * @param {array} lineElements list of classfied elements for a line
 * @returns {array} lineElements with sectorPositions updated
 */
function sectorizeLineElements(lineElements){
    for(var i=0;i<lineElements.length;i++){
        var currentElement = lineElements[i]; 
        if(!currentElement.classifiedElements){
            debugger; //shouldn't happen 
        }
        //Calculate factor to determine sectorPosition
        var maxNum_elements = currentElement.classifiedElements.length; 
        var factor = SEGMENT_NUM / maxNum_elements; 
        //Set sector position for each element
        for(var x=0;x<currentElement.classifiedElements.length;x++){
            var classifiedElement = currentElement.classifiedElements[x];
            //Do calculation step with factor here 
            var sectorPosition         = factor * classifiedElement.linePosition_segments;
            var sectorPosition_rounded = Math.round(sectorPosition);
            if(sectorPosition_rounded==SEGMENT_NUM){
                //Catch edge cases when there is a rounding up where there is no space in array anymore
                sectorPosition_rounded = SEGMENT_NUM-1; 
            }
            classifiedElement.sectorPosition = sectorPosition_rounded;            
        }
    }
    return lineElements;
}



/**
 * Analyzes the dataset created with createDataset. 
 * Creates an array called sectors holder with the size defined in SEGMENT_NUM
 * @returns {bool} true for success, false for failure
 */
function analyzeDataset(){

    var sectorsHolder = new Array(SEGMENT_NUM);
    for(var i=0;i<sectorsHolder.length;i++){
        sectorsHolder[i] = {}; //Create empty objects 
    }
    //Count occurrences array 
    if(!_setToAnalyze.lineElements ||!_setToAnalyze.lineElements.length){
        console.log("Won't do anything, because localDataset doesn't exist");
        return false;
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
            //For each element to a second categorization...for example NUMBER elements are seperated 
            //in a number with dot, a number with comma etc- a key is generated out of that category
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
    console.log(" dataset was analyzed and saved in sectors holder");
    return true;
}
/**
 * This is a class for the grouping algorithm
 * contains a certain keys occurence over multiple segments
 */
function elementStreak(){
    this.startIndex= -1;    //At this index of the line the streak starts
    this.stopIndex = -1;    //At this index of the line the streak stops
    this.maximumIndex = -1; //Index where the maximum number of occence is in that group
    this.maxCtr = -1;       //Amount of maximum occurence
    this.ctrs   = [];       //Counter values from start to stop index
    this.key = undefined;   //Determines the kind of element
    this.groupSpan = -1;    //Size of the group left and right side of the maximum
    this.imax = -1;     //inner-maximum index in ctrs
    this.istart = -1;   //inner-start index for the group in ctrs
    this.istop = -1;    //inner-stop index for the group in ctrs 
    
    /**
     * Returns length of the streak
     * @returns {integer} length of the streak or null
     */
    this.getStreakLength = function(){
        if(this.startIndex!=-1 && this.stopIndex!=-1){
            var length = this.stopIndex-this.startIndex+1;
            return length;
        }else{
            return null;
        }
    }

    /**
     * Removes a set of chars from the streak, and adapts the indices 
     */
    this.removeFromStreak = function(cutStartIndex,cutStopIndex){
        for(var i=cutStartIndex;i<=cutStopIndex;i=i+1){
            this.ctrs[i]=undefined;
        }

        this.findInnerMaximum();
        this.calculateGroupspan();
    }
    /**
     * Finds and sets the maximum within the streak
     */
    this.findInnerMaximum = function(){
        //Find the new maximum
        var newMaximum=-1;
        var imax = -1; 
        for(var i=0;i<this.ctrs.length;i++){
            if(this.ctrs[i] && this.ctrs[i]>newMaximum){
                newMaximum = this.ctrs[i];
                imax = i; 
            }
        }
        if(imax !=-1){
            this.imax = imax;
        }
        if(newMaximum!=-1 && imax !=-1){
            this.maximumIndex = this.startIndex + imax;
            this.maxCtr = newMaximum;
        }

    }
    /**
     * Calculates start index istart and stop index istop, as well as the group span
     */
    this.calculateGroupspan = function(imaxP){
        var imax; 
        if(imaxP){
            imax = imaxP;
        }else{
            this.findInnerMaximum();
            imax=this.imax;
        }
        //Calculate groupspan
        var spanCtr=0;
        var istartSet = false;
        var istart=-1;
        var istop=-1;
        var maxGrpFound = false; 
        for(var i=0;i<this.ctrs.length;i++){
            var currentCtr = this.ctrs[i];
            if(currentCtr){
                spanCtr = spanCtr +1;
                istop = i;
                if(!istartSet){
                    istartSet=true;
                    istart=i;
                }
                if(i==imax){
                    maxGrpFound = true;
                }
            }else{
                if(maxGrpFound){
                    break;
                }
                
                spanCtr=0;
            }
        }
        this.istart = istart;
        this.istop = istop;
        this.groupSpan = spanCtr; 
    }
}

/**
 * Create a set of streak elemnts for an analyzed dataset
 * And then summarize the streak elements and adapt the sectors holder with the grouped elements
 * The elements which are grouped there are flagged.
 */
function doGrouping(){
    console.log("doGrouping");
    if(!_sectorsHolder){
        console.log("Can't do grouping cause not analyzed dataset is there");
        return;
    }
    var sectorsHolder = _sectorsHolder;

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
                    for(var v=startIndexSectorsHolder+1;v<sectorsHolder.length+1;v++){
                        var sectorToCompare = sectorsHolder[v];

                        //Search for element
                        var nextElement; 
                        if(sectorToCompare){
                            nextElement = sectorToCompare[key];
                        }
                        //Compare element occurences 
                        if(!nextElement){
                            currentElement.groupingChecked = true;
                            _elementStreak.stopIndex = currentElementIndex; //Previous element was the last element in streak
                            _elementStreak.ctrs.push(currentElement.ctr);
                            break;
                        }else if(nextElement.ctr == currentElement.ctr){
                            _elementStreak.stopIndex = v; //Take next element as stop index, because there is one
                        }else if(nextElement.ctr > currentElement.ctr){
                            _elementStreak.stopIndex = v; //Take next element as stop index, because there is one
                            _elementStreak.maximumIndex = v; //Move maxindex cause it's bigger
                            _elementStreak.maxCtr = nextElement.ctr;//Also element ctr ...
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
                        _elementStreak.ctrs.push(currentElement.ctr);

                        //Set element for next loop iteration 
                        currentElement = nextElement;
                        currentElementIndex = v;
                    }
                    //Sometimes stop index is still -1, this fixes this circumstance 
                    if(_elementStreak.maximumIndex==sectorsHolder.length-1){
                        _elementStreak.stopIndex = sectorsHolder.length-1; 
                    }
                    if(_elementStreak.startIndex == _elementStreak.stopIndex){
                        continue; //Don't push 1 element streaks
                    }
                    elementStreaks.push(_elementStreak);

                }
            }
        }
    }

    //Create Groups from element streaks, then replace old single elements  with group elements in the sectorsHolder
    for(var i=0;i<elementStreaks.length;i++){
        var streak = elementStreaks[i];
        streak.calculateGroupspan();

        var streaklength = streak.getStreakLength();
        if(streaklength==null){
            debugger; 
            continue;
        }else if(streaklength==1){
            //A streak of one doesn't have to be grouped 
            continue;
        }
        //Extract items to group from the streak
        /*
        if(streak.key == "Marketing"){
            debugger;
        }
        */
        //Determine start index of the group respective the grouping range 
        var startIndex =0;
        var startIndexpossible = (streak.startIndex+streak.imax)-GROUPING_RANGE;
        var startIndexInner = streak.startIndex + streak.istart;

        if(startIndexpossible<startIndexInner){
            startIndex = startIndexInner; //Respect the streak borders 
        }else{
            startIndex = startIndexpossible;
        }

        //Determine stop index of the group respective the grouping range
        var stopIndex =0;
        var stopIndexPossible = (streak.startIndex+streak.imax) + GROUPING_RANGE;
        var stopIndexInner = (streak.startIndex+streak.istop);
        if(stopIndexPossible > stopIndexInner){ //Respect also the streak borders 
            stopIndex = stopIndexInner;
        }else{
            stopIndex = stopIndexPossible;
        }
        //Remove the ctrs from the streaks cause they are grouped now 
        var ctr_startIndex = startIndex-streak.startIndex; //Remove the streak startindex offset to get the position in ctr array 
        var ctr_stopIndex  = stopIndex-streak.startIndex;  //Remove the streakindexoffset



        //Group the items + delete the old parts of the group
        var groupedOccurence = new sectorOccurence();
        groupedOccurence.ctr = 0;
        groupedOccurence.isGroup = true; 
        groupedOccurence.groupingChecked = true; 

        for(var x=startIndex;x<=stopIndex;x++){
            var item = sectorsHolder[x][streak.key];
            if(!item){
               // debugger; //This shouldn't happen TODO put this in or fix issues 

                continue;

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


        //Delete the stuff in the streak which was used for the group
        streak.removeFromStreak(ctr_startIndex,ctr_stopIndex);
        var groupspan = streak.groupSpan;
        if(groupspan>1){    //>1 means a group is still left in the streak
            i = i-1;        //Repeat grouping this streak 
        }

        /*
        if(streak.key == ','){
            console.log(streak);
            debugger; 
        }
        */

    }
    //Replace local sectors holder with the grouped sectors holed
    _sectorsHolder = sectorsHolder;
    console.log("sectorsHolder was grouped");
}



/**
 * Print the dataset to excel file. defined in options.printName
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
            { header: 'Sektor'+i, key: skey, width: 16 }
        );
        skey = generateSectorKey(i+1,2);
        cols.push( 
            { header: '..', key: skey, width: 5 }
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
        editExcelCell("character",worksheet,2,skey,borders);
        
        borders = {bottom:true}
        skey = generateSectorKey(i+1,2); 
        editExcelCell("ctr",worksheet,2,skey,borders);

        borders = {right:true,bottom:true};
        skey = generateSectorKey(i+1,3);
        editExcelCell("group?",worksheet,2,skey,borders);
    }

    var startindexRows = 3;
    //Print sector results 
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
                color = { argb: 'FF00FF00'};// Group is green  
            }else{
                color = { argb: 'FFFF0000'}; //Other item is red
            }

            editExcelCell(currentItem.isGroup,worksheet,rowIndex,sectorKey,borders,color);

            rowIndex=rowIndex+1;
        }
    }
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
/**
 * Generates a sector key out of segment number and sector number 
 * @param {integer} sectorNumber 
 * @param {integer} segmentNumber 
 */
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
