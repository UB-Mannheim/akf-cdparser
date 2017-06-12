const fs = require('fs')

var dictionaryHandler = require('./dictionaryHandler'); 
var cfw               = require('./checkfileWriter');

Array.prototype.trimAll = function() {
    this.forEach((v,idx) => this[idx] = v.trim())
    return this
}

String.prototype.splitAtFirst = function(sep) {
    const idx = this.indexOf(sep)
    return [this.substr(0, idx), this.substr(idx+sep.length)]
}

function _parsePersonName(raw) {
    var ret = {}
    raw.trim().replace(/^((?:(?:[A-Z]{2,} )?[A-ZÖÄÜ][a-zA-Zöäü\.-]+)?\s)?(.*?)\s([A-Za-zöäü]+)$/,
        (_, title, firstName, lastName) => {
            ret = {title, firstName, lastName}
        })
    ret.full = raw
    return ret
}
 
module.exports = class CdHtmlParser {

    constructor() {
        this._parseFunctions = [
            {
                match: 'Wertpapier-Kenn-Nr.:',
                fn: (lines, i, ret) => {
                    lines[i].replace(/\d+$/, (_) => { 
                        ret.wkn = parseInt(_) 
                    })
                    return i
                }
            },
            {
                match: 'ISIN:',
                fn: (lines, i, ret) => {
                    lines[i].replace(/[^>]+$/, (_) => { 
                        ret.isin = _ 
                    })
                    return i
                }
            },
            {
                match: '<b>Sitz</b>',
                fn: (lines, i, ret) => {
                    try{
                    i += 1
                    var addressLines = ''
                    return; //JS: hier momentan einfach abbrechen bis Fehler behoben sind
                    do { addressLines += lines[i++] }
                    while (!(lines[i].match('<!-- weitere Sitze -->'))) //JS: Das produziert eine Index Out Of Bounds exception wenn das Tag nicht vorhanden ist 
                    const addressParts = addressLines.split('<br>').trimAll()
                    const [street_with_number, city_with_zip] = addressParts.shift().split(',').trimAll()
                    street_with_number.replace(/(.*?)\s*(\d+)$/, (_, street, street_number) => {
                        ret.street = street
                        ret.street_number = (street_number)
                    })
                    if (city_with_zip) city_with_zip.replace(/^(\d+)\s*(.*)/, (_, zip, city) => {
                        ret.zip = zip
                        ret.city = city
                    })
                    for (let addressPart of addressParts) {
                        const [k, v] = addressPart.splitAtFirst(':')
                        if (!k) continue
                        if (k.match('Telefon')) ret.phone = v
                        else if (k.match('Telefax')) ret.fax = v
                        else if (k.match(/e.mail/)) ret.email = v.split(/\s*,\s*/)
                        else if (k.match('Internetseite')) ret.www = v.split(/\s*,\s*/)
                        else console.error(`Unkwn addressPart ${k}=${v}`)
                    }
                    return i
                    }catch(ex){
                        console.log(" exception during match  ",ex);
                    }
                },
            },
            {
                match: 'Tätigkeitsgebiet/Gründung',
                disabled: false,
                fn: (lines, i, ret) => {
                    i += 1
                    var activity_description = ''
                    do { activity_description += lines[i++] }
                    while (!(lines[i].match('<b>')))
                    ret.activity_description = activity_description.replace(/<br>/g, '\n')
                    return i-1
                }
            },
            {
                match: '<br><b>Gründung',
                fn: (lines, i, ret) => {
                    lines[i].replace(/\d+/, (_) => ret.established_year = parseInt(_))
                    return i
                }
            },
            {
                match: '<b>Status:',
                fn: (lines, i, ret) => {
                    lines[i].replace(/[^>]+$/, (_) => ret.status = _)
                    return i
                }
            },
            {
                match: '>Beschäftigte',
                disabled: false,
                fn: (lines, i, ret) => {
                    var employee_stats = []
                    const ucStyle = lines[i].match('LEFT')
                    while (!(lines[i++].match('</table>'))) {
                        if (!(lines[i].match('<td'))) continue
                        const stat = lines[i].replace(/<[^>]+>/g, '').trim()
                        if (ucStyle) {
                            if (lines[i].match('width') || lines[i].match('LEFT')) continue
                            employee_stats.push(stat)
                        } else {
                            employee_stats.push(stat)
                        }
                    }
                    ret.employee_stats = employee_stats
                    return i
                }
            },
            {
                match: 'b>Aufsichtsrat:</b><br>',
                fn: (lines, i, ret) => {
                    var originline = i; 
                    i += 1
                    var aufsichtsrat = ''
                    do { aufsichtsrat += lines[i++].replace('<br>', '') }
                    while (!(lines[i].match('<b>')))
                    ret.aufsichtsrat = []
                    aufsichtsrat.split(/\s*;\s*/).trimAll().forEach(_ => {                                                       
                        //console.log("Line to check is: ",_);
                        var manager = checkPersonLine(_,originline);
                        cfw.writeToCheckfile(originline,_,JSON.stringify(manager), cfw.config.checkfile_aufsichtsrat ,cfw.config.checkfile_aufsichtsrat_enabled);                                        
                        ret.aufsichtsrat.push(manager);
                        return i-1;
                    });
                }
            },
            {
                match: 'b>Aufsichtsrat: </b><br>',
                fn: (lines, i, ret) => {
                    var commonfunct_isThere = false; 
                    var commonfunct=''; 

                    var originline = i;                 
                    var aufsichtsrat = lines[i].replace(/b>Aufsichtsrat: <\/b><br>/i,'');   //replace aufsichtsrat starter 
                    aufsichtsrat = aufsichtsrat.replace(/<br>|<|>/gi,'');                   //replace html tag rests
                    i += 1 
                    do { 
                        //Sometimes a common title with abbreviation is there, line looks like:"*) Arbeitnehmervertreter<br>"
                        if(lines[i].match(/^\*\)/)){
                            var recline = lines[i];
                            commonfunct = recline.replace('*)','').replace('<br>','').trim();
                            commonfunct_isThere = true; 
                        }
                        aufsichtsrat += lines[i++].replace('<br>', '');                        
                    }while (!(lines[i].match('<b>')))
                    ret.aufsichtsrat = []
                    aufsichtsrat.split(/\s*;\s*/).trimAll().forEach(_ => {                                                       
                        //console.log("Line to check is: ",_);
                        var manager = checkPersonLine(_,originline,commonfunct_isThere,commonfunct);
                        cfw.writeToCheckfile(originline,_,JSON.stringify(manager), cfw.config.checkfile_aufsichtsrat ,cfw.config.checkfile_aufsichtsrat_enabled);                                        
                        ret.aufsichtsrat.push(manager);
                        return i-1;
                    });
                }
            },
            {
                match: 'b>Vorstand:</b><br>',
                fn: (lines, i, ret) => {
                    var originline = i;                 
                    i += 1
                    var vorstand = ''
                    do { vorstand += lines[i++].replace('<br>', '') }
                    while (!(lines[i].match('<b>')))  
                    ret.vorstand = []

                    vorstand = replaceSemicolonAndCommaInBrackets(vorstand); 

                    var iend = parseVorstand(vorstand,originline,i,ret);
                    return iend; 
                }
            }, 
            {
                match: 'b>Vorstand: </b><br>',
                fn: (lines, i, ret) => {
                    var originline = i;       
                    var lineBRsplit = lines[i].split('<br>');
                    if(lineBRsplit.length <1) throw "Exception in lineBRsplit";
                    var lineBRsplice = lineBRsplit.splice(1);    
                    i += 1
                    var vorstand = '';
                    for(var x=0;x<lineBRsplice.length; x++){
                       vorstand+=lineBRsplice[x]; 
                    }       
                    ret.vorstand = []

                    var iend = parseVorstand(vorstand,originline,i,ret);
                    return iend;                 
                }
            },
            {
                match: 'b>Geschäftsleitung:</b><br>|b>Geschäftsleitung: </b><br>',
                fn: (lines, i, ret) => {
                    var originline = i;       
                    var lineBRsplit = lines[i].split('<br>');
                    if(lineBRsplit.length <1) throw "Exception in lineBRsplit";
                    var lineBRsplice = lineBRsplit.splice(1);    
                    var geschleitung = '';
                    for(var x=0;x<lineBRsplice.length; x++){
                       geschleitung+=lineBRsplice[x]; 
                    }
                    i += 1
                    if(geschleitung===''){
                        //The result must be in the next line line 
                        geschleitung=lines[i].replace('<br>','');
                    }       
                    ret.geschleitung = []
                    geschleitung = replaceSemicolonAndCommaInBrackets(geschleitung);
                    geschleitung.split(/\s*;\s*/).trimAll().forEach(_ => {                                                       
                        //console.log("Line to check is: ",_);
                        var manager = checkPersonLine(_,originline,false,""); //JS: HINT ADD COMMON FUNCTION IF NECESSARY 
                        cfw.writeToCheckfile(originline,_,JSON.stringify(manager), cfw.config.checkfile_geschleitung ,cfw.config.checkfile_geschleitung_enabled);                                        
                        ret.geschleitung.push(manager);
                        return i-1;
                    });
                }
            },
            {
                /** 
                 * Remark: some lines are parsed directly in 'bemerkung' when there is no valid currency
                 * origin: Vorstand 1996: keine Angaben gem. § 286 Abs. 4 HGB 
                 * parsed {"jahr":"1996","bemerkung":"Vorstand 1996: keine Angaben gem. § 286 Abs. 4 HGB"}
                 */
                match: 'b>Organbezüge:</b>|b>Organbezüge :</b>|b>Organbezüge: </b>|b>OrganbezÃ¼ge:Â </b>',
                fn: (lines, i, ret) => {
                    var originline = i;      
                    var lineBRsplit = lines[i].split('</b>');                       
                    //cfw.writeHeaderToCheckFile(lineBRsplit,checkfile_organbezuege,checkfile_organbezuege_enabled);

                    if(lineBRsplit.length <1) throw "Exception in lineBRsplit";
                    var lineBRsplice = lineBRsplit.splice(1);    
                    var organbezuege = '';
                    for(var x=0;x<lineBRsplice.length; x++){
                       organbezuege+=lineBRsplice[x].replace(/<br>/g,''); 
                       cfw.writeHeaderToCheckFile(organbezuege,cfw.config.checkfile_organbezuege,cfw.config.checkfile_organbezuege_enabled);
                    }
                    i += 1      
                    return parseOrganbezuege(organbezuege,originline,i,ret);
                    
                }
            },
        ]
    }

    parseFile(filename) {
        console.log("Parser.js parsing file: ",filename);
        cfw.writeHeaderToCheckFile(filename+"-----------------------------",cfw.config.checkfile_aufsichtsrat,cfw.config.checkfile_aufsichtsrat_enabled);
        cfw.writeHeaderToCheckFile(filename+"-----------------------------",cfw.config.checkfile_vorstand,cfw.config.checkfile_vorstand_enabled);
        cfw.writeHeaderToCheckFile(filename+"-----------------------------",cfw.config.checkfile_geschleitung,cfw.config.checkfile_geschleitung_enabled);
        cfw.writeHeaderToCheckFile(filename+"-----------------------------",cfw.config.checkfile_organbezuege,cfw.config.checkfile_organbezuege_enabled);

        dictionaryHandler.createTitlesDict();
        dictionaryHandler.createFunctionsDict();
        return this.parse(fs.readFileSync(filename, {encoding: 'utf8'}))
    }

    parse(linesStr) {
        const lines = linesStr.split('\n');
        const ret = {}
        ret._fulltext = linesStr
            .replace(/<head>[\s\S]*<\/head>/i,'')   //replace all whitespace and n-whitespace characters between the header and the header tags 
            .replace(/<[^>]+>/g,'')                 //replace all html opening or closing tags in this script
      
        for (let i = 0; i < lines.length; i++) {
            
            for (let parseFunction of this._parseFunctions) {
                
                //if the line matches a string in the parsefunction match call the corresponding parser function 
                var lineTrim = lines[i].trim(); 

                if (lineTrim.match(parseFunction.match) && !parseFunction.disabled) {
                    i = parseFunction.fn(lines, i, ret) || i
                    break
                }
            }
        }
        return ret
    }
}
/**
 * Check a person-related string for contents (Title,Name,Function,City etc), detect these contents and put them in the 
 * return object in a classificated manner. 
 * @param {string} _  line containing a person related string (i.e from 'Vorstand', 'Aufsichtsrat' or 'Geschäftsführung')
 * @param {int} originline starting index of the contents related to '_' 
 * @param {boolean} commonfunct_isThere  indicator if there was a common 'function' detected somewhere in this content
 * @param {string} commonfunct the common 'function' which was recognized (i.e. 'Arbeitnehmervertreter')
 * @returns {object} an object containing all the classified data 
 */
function checkPersonLine(_,originline,commonfunct_isThere,commonfunct){
    
    var bemerkung; 
    //Remove the '(persönlich haftend)' tag from line for further processing, add it as bemerkung for the returned manager object 
    var persHaftend = new RegExp(/\(persönlich haftend\)/gi); 
    var persHaftendMatch = _.match(persHaftend);
    if(persHaftendMatch!=null && persHaftendMatch.length>=1){
        _ = _.replace(persHaftend,'');
        bemerkung= persHaftendMatch[0];
    }
    
    //Remove the (x Mitglieder) lines TODO: Think about if this can be added to the database later 
    var xMitglieder = new RegExp(/\([\d]+ Mitglieder\)/gi); 
    var xMitgliederMatch = _.match(xMitglieder);
    if(xMitgliederMatch!=null && xMitgliederMatch.length>=1){
        _ = _.replace(xMitglieder,'');
    }

   
    //Split and parse the line _
    var linesplit = _.split(',');           //comma seperated line 
    var nameStartIndex=-1; 
    var currentIndex =-1;                       
    var nameAndFunctInfo;                   //object for storing detected name and funct 
    var titleInfo;                          //object for storing detected title


    //Title detection 
    var matchingOption ="rmal";           //'rmal' or 'ldist' is possible 
    titleInfo = dictionaryHandler.checkIfTitleIsInArray(linesplit,',',matchingOption);  

    //Name and Funct detection 
    var functLastLineInfo = dictionaryHandler.checkIfaFunctContentIsInString(linesplit[linesplit.length-1]); 
    if(functLastLineInfo.isTitle){  //If the title was recognized in lastline delete it to t confuse further processing 
        if(!functLastLineInfo.hasRest || functLastLineInfo.dataWithoutTitle.trim().length==0){ //if there is  rest or the rest are just spaces ... 
            linesplit =  linesplit.splice(0, linesplit.length-1);
        }
        if(functLastLineInfo.hasRest){
            linesplit[linesplit.length-1] = functLastLineInfo.dataWithoutTitle.trim();
        }
    }
    if(!titleInfo.hasName && !titleInfo.hasTitle){
        currentIndex=0; //Proceed with the first element for name detection 
        if(!linesplit[currentIndex]){
            nameAndFunctInfo = detectNameAndFunct(""); 
        }else{
            nameAndFunctInfo = detectNameAndFunct(linesplit[currentIndex].replace(/\*\)/g,'')); 
        }
        currentIndex = currentIndex+1; 
    }
    else if(titleInfo.hasName){
        if(!titleInfo.hasTitle){
            nameAndFunctInfo = detectNameAndFunct(titleInfo.nameDetected.replace(/\*\)/g,'')); //why was this here`?
        }else{
            currentIndex = 0; 
            nameAndFunctInfo = detectNameAndFunct(
                  linesplit[currentIndex].replace(/\*\)/g,'').replace(titleInfo.titleDetected,''));
        }


        currentIndex = titleInfo.nextIndex;
    }else {
        try{

            //Index is t placed right atm....
            var lineToCheck = linesplit[titleInfo.nextIndex];

            nameAndFunctInfo = detectNameAndFunct(lineToCheck.replace(/\*)/g,''));
            currentIndex = titleInfo.nextIndex; 
        }catch(ex){
            console.log("Exception at line ",originline," with string ",_);
        }
    }

    //City detection (also for special cases funct is already detected) 
    var funct =""; 
    var cityAcc=""; 
    for(var i=currentIndex;i<linesplit.length;i++){
        try{
            var lineToApply = linesplit[i]; 

            if(linesplit[i].match(/\*\)/g)){
                //This is a specific case which contains actually the function 
                lineToApply = lineToApply.split("*)")[0].trim();
            }
            //JS this is temporary to see if there are more entries then 3 for the city
            if(cityAcc===""){
                cityAcc = lineToApply.trim();
            }else{
                cityAcc = cityAcc +" ("+lineToApply.trim()+")";  
            }
        }catch(ex){
            console.log(" Exception ",ex);
        }
    }


    var title = titleInfo.titleDetected; 
    var firstName = nameAndFunctInfo.firstname; 
    var lastName = nameAndFunctInfo.lastname; 
    var funct = functLastLineInfo.isTitle? functLastLineInfo.titleFound : nameAndFunctInfo.detectedFunct; //If function is in the lastline take it from there otherwise from brackets 
    if(commonfunct_isThere){ //A common funct can be there for a set of multiple lines, but for the specific lines it needs to be matched again
        if(_.indexOf('*)')!=-1){
            cityAcc = cityAcc.replace('*)','');
            if(funct.trim()!==commonfunct.trim()){ //Without this there could be double 'Arbeitnehmervertreter' i.e. in the final funct
                funct +=" "+ commonfunct;
                funct = funct.trim();    
            }
        }       
    }

    //Creating Manager object
    const manager = {title, firstName, lastName, cityAcc, funct,bemerkung}; 
    for (let k in manager) if (!manager[k]) delete manager[k]

    return manager; 
}

/**
 * Parse content related to 'Vorstand' 
 * @param {string} vorstand semicolon seperated line with vorstand 
 * @param {int} originline index of original line related to this entry, mainly used for logging 
 * @param {int} i index of the last line related to this entry, for return value for next entry
 * @param {object} ret object for parsing-json files, results of the parsing gets added to this object 
 */
function parseVorstand(vorstand,originline,i,ret){
    vorstand = replaceSemicolonAndCommaInBrackets(vorstand); 

    vorstand.split(/\s*;\s*/).trimAll().forEach(_ => {              //Split all entries between semicolon and trim

        /* 
        if(_.indexOf("Klaus-Dieter Peters")!=-1){
            console.log(" Next line should be added also they seem interconnected  ; in the function brackets should split the whole string ");
        }
        */
        var manager = checkPersonLine(_,originline);
        cfw.writeToCheckfile(originline,_,JSON.stringify(manager), cfw.config.checkfile_vorstand ,cfw.config.checkfile_vorstand_enabled);                                        
        ret.vorstand.push(manager);
        return i-1;
    })
}

/**
 * Parses content matched with 'Organbezug' into the value given in ret
 * @param {string} organbezuege semicolon seperated line with data for organbezüge 
 * @param {int} originline index of original line related to this entry, mainly used for logging  
 * @param {int} i index of the last line related to this entry, for return value for next entry 
 * @param {object} ret object for parsing-json files, results of the parsing gets added to this object 
 */
function parseOrganbezuege(organbezuege,originline,i,ret){
    organbezuege = replaceSemicolonAndCommaInBrackets(organbezuege);
    //Check if there are multiple years or just one
    var yearmatch = organbezuege.match(/\d\d\d\d/g);
    var oneYearForAll; 
    var multiYearFallback;
    if(yearmatch==null){
        console.log("tag");
    }else if(yearmatch.length==1){
        oneYearForAll = yearmatch[0]; 
    }else if(yearmatch.length>1){
        multiYearFallback = yearmatch[0]; //Sometimes there is a line with multiple years, but one entry has no year for that use this variable 
    }

    organbezuege.split(/\s*;\s*/).trimAll().forEach(_ => {      
        var waehrungRegex = new RegExp(/(TDM)|(DM)|(TEUR)|(EUR)/);
        var jahr; 
        var organ;
        var bezuege;
        var bemerkung;

        if(oneYearForAll){
            //If ONE YEAR was recognized, each entry is: 'Organ: Bezüge' 
            //Filter exceptions 
            if(_.indexOf("keine Vergütung")!=-1){
                jahr = oneYearForAll; 
                bemerkung = _.replace(jahr,'').replace(':','').trim();
            }else{
                //Standard parsing 
                jahr = oneYearForAll; 
                var _withoutYear = _.replace(jahr,'').trim();
                var waehrungmatch = _withoutYear.match(waehrungRegex);
                if(waehrungmatch!=null){
                    var waehrung = waehrungmatch[0];
                    var weaReg = new RegExp(waehrung); 
                    var linesplit = _withoutYear.split(weaReg);                       
                    organ = linesplit[0].replace(':','').trim();
                    bezuege = waehrung +" "+linesplit[1].trim();
                }else{
                    bemerkung = _withoutYear;
                }
            }
        }else{
            //If multi years were recognized, each entry is Organ year: bezüge      
            var yearmatch = _.match(/\d\d\d\d(\/\d\d)*/g); //Match the year which can be something like 1996 or 1995/96
            if(yearmatch!=null){
                jahr = yearmatch[0];
                var _withoutYear=_.replace(jahr,'').trim();
                var waehrungmatch = _withoutYear.match(waehrungRegex);
                if(waehrungmatch!=null){
                    var waehrung = waehrungmatch[0];
                    var weaReg = new RegExp(waehrung); 
                    var linesplit = _withoutYear.split(weaReg);
                    if(linesplit.length>1){
                        organ = linesplit[0].replace(':','').trim();
                        bezuege = waehrung +" "+linesplit[1].trim();
                    }else{
                        bemerkung = linesplit[0];
                    }                       
                }else{
                    bemerkung = _;
                }
            }else{
                try{
                    var waehrungmatch = _.match(waehrungRegex);
                    if(waehrungmatch!=null){
                        var waehrung = waehrungmatch[0];
                        var weaReg = new RegExp(waehrung); 
                        var linesplit = _.split(weaReg);
                        if(linesplit.length>1){
                            jahr = multiYearFallback;
                            organ = linesplit[0].replace(':','').trim();
                            bezuege = waehrung +" "+linesplit[1].trim();
                        }else{
                            bemerkung = linesplit[0];
                        }
                    }                       

                }catch(ex){
                    throw "invalid year detected in "+_;
                }
            }
        }
        const organbezug = {jahr, organ, bezuege,bemerkung}; 
        for (let k in organbezug){
            if (!organbezug[k]){
                delete organbezug[k];
            }else{
                organbezug[k] = organbezug[k].replace('()','');
            } 
        } 

        cfw.writeToCheckfile(originline,_,JSON.stringify(organbezug), cfw.config.checkfile_organbezuege ,cfw.config.checkfile_organbezuege_enabled);                                        
        ret.organbezuege = [];
        ret.organbezuege.push(organbezug);
        return i-1;
    });
}

/**
 * Replaces all occurences of ';'-character and ';'-character WITHIN brackets '()' in the given string with ' ' 
 * @param {string} inputString input data which can have brackets i.e. "This, is (bracketcontent;semicolon);other stuff (bracketcontent)"
 * @returns {string} corrected input string without brackets 
 **/
function replaceSemicolonAndCommaInBrackets(inputString){
    var bracketsList = inputString.match(/\((.*?)\)/g);
    if(bracketsList==null) return inputString; 
    
    for(var x=0;x<bracketsList.length;x++){
        var inBrackets = bracketsList[x];
        if(inBrackets && (inBrackets.indexOf(';')!=-1||inBrackets.indexOf(',')!=-1)){
            var newInBrackets = inBrackets.replace(/;/g,' ');
            newInBrackets = newInBrackets.replace(/,/g,' ');
            inputString = inputString.replace(inBrackets,newInBrackets); //Replace ; within brackets with whitespace 
        }
    }
    return inputString; 
}


/**
 * Detect First Name and Lastname from given name and also the function which is in '()'  
 * @param {string} data: An example input string looks like this: Jane Vaine (Vors.) 
 * @returns {object} which contains the detected name and function and indicators if these properties could be found 
 **/ 
function detectNameAndFunct(data){
    
    var returbj = {
        detectedName:"", 
        hasName: false,
        detectedFunct:"",
        hasFunct: false,
        firstname:"",
        lastname:""
    }

    
    try{

        //Check if funct is in ()      
        var returnmatch = data.match(/\((.*?)\)/);
        
        if(returnmatch!=null){
            returbj.hasFunct = true; 
            returbj.detectedFunct = returnmatch[1];
            returbj.hasName = true; 
            returbj.detectedName =  data.replace(returnmatch[0],"").trim(); 
        }else{
            returbj.hasName = true; 
            returbj.detectedName = data;
        }
        /*
        if(data.indexOf("Claude Bébéar")!=-1){
            console.log("You win a price! ");
        }
        */
        //Split name in first and lastname 
        var namesplit = returbj.detectedName.trim().split(' ');
        var lastname = namesplit[namesplit.length-1]; //Just take the last element
        var firstname = returbj.detectedName.replace(lastname,""); 
        returbj.lastname = lastname; 
        returbj.firstname = firstname; 

        return returbj;

    }catch(ex){
        console.error("Problem detecting name and funct for ",data," exception ",ex); 
        return null;   
    }
}