var regLib       = require('./regexLib');
var cfw          = require('./checkfileWriter');
var utils        = require('./utils.js');
/**
 * Parse content which contains multiple aktionaer 
 * @param {array} aktionaerlines array of strings which contains the aktionär field content 
 * @param {int} originline index of original line related to this entry, mainly used for logging  
 * @param {int} i index of the last line related to this entry, for return value for next entry 
 * @param {object} ret object for parsing-json files, results of the parsing gets added to this object 
 * 
 * Possible columns in currentline: 
 * Name, (Anteil)|Anteil (opt Anteilseigner blablabla )
 * Name, Ort, (Anteil)|Anteil (opt Anteilseigner blablabla)
 * Streubesitz, (Anteil)|Anteil oder nix (opt Anteilseigner blablabla)
 * 
 */
function parse_aktionaer(aktionaerlines,originline,y){
    var aktionaereRet = [];
    for(var i=0;i<aktionaerlines.length;i++){
        var currentline = aktionaerlines[i];  //Gets modified over this function 

        /*
        if(currentline.indexOf("Streubesitz")!=-1){
            console.log(" test ");
        }
        */
        var bemerkung=""; 
        var anteil=""; 
        var name;
        var ort=""; 

        //var percentagematch = currentline.match(/(\d+(?:,\d+)?)(\s*%)/g);
        var percentagematch = regLib.matchPercentage(currentline); 

        if(percentagematch!=null && percentagematch.length>=1){

            for(var x=0;x<percentagematch.length;x++){
                var infillmatch = regLib.checkIfStringIsInParenthesis(percentagematch[x],currentline);
                if(infillmatch!=null && infillmatch.length>=1){
                    //If there is additinional text around the brackets it will be assigned to 'bemerkung
                    bemerkung = infillmatch[0].replace("(",'').replace(")",'');
                }else{
                    anteil = percentagematch[x];
                }          
            }
        }
        if(anteil!=""){
            currentline = currentline.replace(anteil,'').replace('()','');
        }
        if(bemerkung!=""){
            currentline = currentline.replace(bemerkung,'').replace('()','');
        }

        var currentlineSplit = currentline.trim().split(/,|;/g);
        //Delete the last element if it's empty 
        if(currentlineSplit[currentlineSplit.length-1]=="") currentlineSplit.splice(currentlineSplit.length-1,1); 
        if(currentlineSplit.length==1){
            name = currentlineSplit[0];
        }else{
            name = currentlineSplit[0];
            ort = currentlineSplit[1];
        }

         //In the akf1 database 'aktionaer' has the follwing columns and content:  
         //Name                 'Aktiengesellschaft für Licht- und Kraftversorgung' oder auch 'Streubesitz' 
         //Ort                  bsp 'Kawasaki'
         //Anteil               über 75% oder 'Mehrheit' oder 'Rest' 
         //Abschnitt            Nummer 1-4 
         //Bemerkung            als deutsche Holding der "Holderbank" Financière Glarus AG, Glarus/Schweiz
         //BemerkungAbschnitt   zus.rd.70%

        const manager = {name, ort, anteil,bemerkung}; 
        for (let k in manager){
             if (!manager[k]) delete manager[k];
        }

        cfw.writeToCheckfile(originline,aktionaerlines[i],JSON.stringify(manager), cfw.config.checkfile_aktionaere ,cfw.config.checkfile_aktionaere_enabled);                                        
        if(!utils.isObjectEmpty(manager)){
            aktionaereRet.push(manager);
        } 
    }
    return aktionaereRet;

}

/**
 * Parse content which contains one or multiple anteils eigner 
 * @param {array} investorRelLines array of strings which contains the investor Relations field content 
 * @param {int} originline index of original line related to this entry, mainly used for logging  
 * @param {int} y index of the last line related to this entry, for return value for next entry 
 * @param {object} ret object for parsing-json files, results of the parsing gets added to this object 
 * 
 * 
 * Is constructed like: 
 * Eigner (can have city or country sometimes),anteil as percentage,
 * 
 */
function parse_anteilsEigner(anteilsEignerLines,originline,y,ret){

    ret.anteilsEigner = [];
    for(var i=0;i<anteilsEignerLines.length;i++){

        var currentline = anteilsEignerLines[i];
        if(currentline.trim()==""){
            continue;
        }
        /*
        if(currentline.indexOf("Streubesitz")!=-1){
            console.log(" test ");
        }
        */

        var bemerkung=""; 
        var anteil=""; 
        var eigner;
 

        //var percentagematch = currentline.match(/(\d+(?:,\d+)?)(\s*%)/g);
        var percentagematch = regLib.matchPercentage(currentline); 

        if(percentagematch!=null && percentagematch.length>=1){

            for(var x=0;x<percentagematch.length;x++){
                var infillmatch = regLib.checkIfStringIsInParenthesis(percentagematch[x],currentline);
                if(infillmatch!=null && infillmatch.length>=1){
                    //If there is additinional text around the brackets it will be assigned to 'bemerkung
                    bemerkung = infillmatch[0].replace("(",'').replace(")",'');
                }else{
                    anteil = percentagematch[x];
                }          
            }
        }
        if(anteil!=""){
            currentline = currentline.replace(anteil,'').replace('()','');
        }

        if(bemerkung!=""){
            currentline = currentline.replace(bemerkung,'').replace('()','');
        }
        
        eigner = regLib.removeLastComma(currentline.trim());
        

        const manager = {eigner, anteil,bemerkung}; 
        for (let k in manager) if (!manager[k]) delete manager[k];
        cfw.writeToCheckfile(originline,anteilsEignerLines[i],JSON.stringify(manager), cfw.config.checkfile_anteilseigner,cfw.config.checkfile_anteilseigner_enabled);                                        

        ret.anteilsEigner.push(manager);
    }
    return ret;
}



/**
 * Parse content which contains one or multiple anteils eigner 
 * @param {array} investorRelLines array of strings which contains the investor Relations field content 
 * @param {int} originline index of original line related to this entry, mainly used for logging  
 * @param {int} y index of the last line related to this entry, for return value for next entry 
 * 
 * @returns returnobject which contains an array of the parsed 'beteiligungen' from input 'wesentlicheBeteiligungen'
 * Is constructed like: 
 * Eigner (can have city or country sometimes),anteil as percentage,
 * 
 */
function parse_beteiligungen(wesentlicheBeteiligungen,originline,y){
    var retBeteiligungen = []; //Holder array for returnvalue 
    if(wesentlicheBeteiligungen==null){
        return null; 
    }
    for(var i=0;i<wesentlicheBeteiligungen.length;i++){
        
        if(!wesentlicheBeteiligungen[i]){
            continue;
        }
        var currentline = wesentlicheBeteiligungen[i].trim();
        
        if(currentline===""){
            continue;
        }


        
        if(currentline.indexOf("654")!=-1){
            console.log(" test ");
            console.log(" test ");
        }
        
    
        //Match a entry which ends like this (Konsolidierungskreis:)
        var matchCol = regLib.findStringWhichEndsWithColon(currentline);
        if(matchCol && matchCol.length>=1){
            continue;
        }

        //Match entries which are just in parenthesis and skip these (direkte Mehrheitsbeteiligungen)
        var matchParenth = regLib.matchBetweenParenthesis(currentline);
        if(matchParenth && matchParenth.length>=1){
            var reducedString = currentline.replace(matchParenth[0],'').trim();
            if(reducedString==""){
                continue;
            }
        }


        if(currentline.indexOf("Konsolidierungskreis")!=-1){
            console.log(" Wird nicht richtig geparsed ");
        }

        var beteiliger  ="";
        var ort         =""; 
        var anteil      =""; 
        var bemerkung   =""; 


        //Replace ',' in numbers
        currentline = regLib.replaceCommaInNumber(currentline,'¦');
        //Replace ',' and ';' within brackets
        currentline = regLib.replaceSemicolonAndCommaInBrackets(currentline);
        var currentlineSplit = currentline.split(',');
        //Restore the ',' in numbers (mainly used for checking with HTMLvsJSON
        for(var x=0;x<currentlineSplit.length;x++){
            if(currentlineSplit[x].indexOf('¦')!=-1){
                currentlineSplit[x] = currentlineSplit[x].replace(/¦/g,',');
            }
        }

        //Find Anteil         
        if(currentlineSplit.length==1){
            beteiliger = currentlineSplit[0];
        }else if(currentlineSplit.length==2){
            beteiliger = currentlineSplit[0];
            anteil = currentlineSplit[1];
        }else if(currentlineSplit.length==3){
            beteiliger = currentlineSplit[0]
            ort = currentlineSplit[1];
            anteil = currentlineSplit[2];
        }else{
            ort = currentlineSplit[currentlineSplit.length-2];
            anteil = currentlineSplit[currentlineSplit.length-1];
            for(var x=0;x<currentlineSplit.length-2;x++){
                beteiliger =beteiliger + currentlineSplit[x]+",";
            }
            //bemerkung = currentlineSplit[3];
            beteiliger = regLib.removeLastComma(beteiliger);
        }


        //Catching some different behaviour i.e. in year 2004: 
        //should   catch-> 3U TELECOM B.V., Hilversum (Niederlande) (100%) 
        //shouldnt catch-> 1 & 1 Telekommunikation GmbH, Montabaur, Eigenkapital: DM 0,5 Mio (100%)
        //shouldnt catch-> " Schlachtbetrieb GmbH, Vilshofen, Niederbay, 58.33%"
        if(currentline.indexOf("apital:")==-1){ //recognition is faulty kapital still recognized 
            //Anteil doesn't contain Kapital 
            var percentageMatch = regLib.matchPercentage(anteil);
            if(percentageMatch){
                
                var maybeOrt = anteil.replace(percentageMatch[0],"").trim();
                maybeOrt = maybeOrt.replace(/\(\)/g,''); //replace brackets if there are some 
                if(maybeOrt && maybeOrt.length>1){
                    ort = maybeOrt;
                    anteil = percentageMatch[0];
                }
            }
        }




        const manager = {beteiliger, ort, anteil, bemerkung}; 
        for (let k in manager){
            if (!manager[k]){ 
                delete manager[k]
            }else{
                manager[k] = manager[k].trim();
            }
        }        
        cfw.writeToCheckfile(originline,wesentlicheBeteiligungen[i],JSON.stringify(manager), cfw.config.checkfile_beteiligungen,cfw.config.checkfile_beteiligungen_enabled);                                        
        retBeteiligungen.push(manager);
    }
    return retBeteiligungen;
}


function prepareBeteiligungen(linesBeteiligungen){
    var beteiligungenFinal=""; 

    if(linesBeteiligungen.length==1){
        var linesBRSplit = linesBeteiligungen[0].split('<br>'); 
        var linesBR_BSplit= linesBRSplit[0].split("</b>");
        if(linesBR_BSplit.length>=2){
            //Add second element to linesbrsplit as second element
            linesBRSplit.push(linesBR_BSplit[1]);
        }

        var lineBRsplice = linesBRSplit.splice(1);   //Cutout the first line  
        beteiligungenFinal = lineBRsplice; 
    
    }else{

        if(!linesBeteiligungen[1]){
            return null;
        }
        var linesBRSplit = linesBeteiligungen[1].split('<br>');
        beteiligungenFinal = linesBRSplit; 
    }                   
    
    for(var y=0;y<beteiligungenFinal.length;y++){
        beteiligungenFinal[y] = regLib.stripHTMLtags(beteiligungenFinal[y]);
    }

    beteiligungenFinal = beteiligungenFinal.filter(
        function(n){ 
            if(n==="") return false; 
            else if(!n) return false; 
            else return true; 
        }
    ); 

    return beteiligungenFinal; 
}

module.exports = {
    parse_aktionaer,
    parse_beteiligungen,
    parse_anteilsEigner,
    prepareBeteiligungen
}