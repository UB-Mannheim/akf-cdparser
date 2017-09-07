const fs = require('fs');

var dir = './checkfiles/';
try {
  fs.mkdirSync(dir);
} catch(e) {
}

const config = {
    checkfile_aufsichtsrat_enabled: true,
    checkfile_aufsichtsrat: "Checkfile_Aufsichtsrat.txt",
    checkfile_vorstand_enabled: true, 
    checkfile_vorstand: "Checkfile_Vorstand.txt", 
    checkfile_geschleitung_enabled: true, 
    checkfile_geschleitung: "Checkfile_Geschleitung.txt", 
    checkfile_organbezuege_enabled: true, 
    checkfile_organbezuege: "Checkfile_Organbezuege.txt", 
    checkfile_aktionaere_enabled: true, 
    checkfile_aktionaere: "Checkfile_Aktionaere.txt", 
    checkfile_investorRelations_enabled: true, 
    checkfile_investorRelations: "Checkfile_InvestorRelations.txt",
    checkfile_publicRelations_enabled: true, 
    checkfile_publicRelations: "Checkfile_PublicRelations.txt",
    checkfile_gesellschafter_enabled: false, 
    checkfile_gesellschafter: "Checkfile_Gesellschafter.txt", 
    checkfile_anteilseigner_enabled: true, 
    checkfile_anteilseigner: "Checkfile_Anteilseigner.txt",
    checkfile_beteiligungen_enabled: true, 
    checkfile_beteiligungen: "Checkfile_Beteiligungen.txt",
    checkfile_kapitalentwicklung_enabled: true, 
    checkfile_kapitalentwicklung: "Checkfile_Kapitalentwicklung.txt", 
    checkfile_grundkapital_enabled: true, 
    checkfile_grundkapital: "Checkfile_Grundkapital.txt", 
    checkfile_genehmkapital_enabled: true, 
    checkfile_genehmkapital: "Checkfile_GenehmigtesKapital.txt", 
    checkfile_bedingkapital_enabled: true, 
    checkfile_bedingkapital: "Checkfile_BedingtesKapital.txt", 
    checkfile_besbezugsrechte_enabled: true, 
    checkfile_besbezugsrechte: "Checkfile_BesondereBezugsrechte.txt", 
    checkfile_ermAktienerwerb_enabled: true, 
    checkfile_ermAktienerwerb: "Checkfile_ErmächtigungAktienerwerb.txt",
    checkfile_boersenbewertung_enabled: true, 
    checkfile_boersenbewertung: "Checkfile_BoersenBewertung.txt",
    checkfile_sitz_enabled: true, 
    checkfile_sitz: "Checkfile_Sitz.txt",
    checkfile_taetigkeitsgebiet_enabled: true, 
    checkfile_taetigkeitsgebiet: "Checkfile_Taetigkeitsgebiet.txt",
    checkfile_gruendung_enabled: true, 
    checkfile_gruendung: "Checkfile_Gruendung.txt",
    checkfile_status_enabled: true, 
    checkfile_status: "Checkfile_Status.txt",
    checkfile_beschaeftigte_enabled: true, 
    checkfile_beschaeftigte: "Checkfile_Bescheaftigte.txt",
    checkfile_bereinigtekurse_enabled: true, 
    checkfile_bereinigtekurse: "Checkfile_BereinigteKurse.txt",
    checkfile_wknentry_enabled: true, 
    checkfile_wknentry: "Checkfile_WKNEntry.txt",
    checkfile_name_enabled: true, 
    checkfile_name: "Checkfile_Name.txt",
    checkfile_dividenden_enabled: true, 
    checkfile_dividenden: "Checkfile_Dividenden.txt",
    checkfile_kennzahlen_enabled: true, 
    checkfile_kennzahlen: "Checkfile_Kennzahlen.txt",
    checkfile_aus_bilanzen_enabled: true, 
    checkfile_aus_bilanzen: "Checkfile_aus_Bilanzen.txt",
    checkfile_aus_den_gewinn_und_verlustrechnungen_enabled: true, 
    checkfile_aus_den_gewinn_und_verlustrechnungen: "Checkfile_aus_den_gewinn_und_verlustrechnungen.txt",
    checkfile_index_enabled: true, 
    checkfile_index: "Checkfile_Index.txt",
    checkfile_angaben_enabled: true, 
    checkfile_angaben: "Checkfile_Sonstige_Angaben.txt",
    checkfile_ausgegebenesKapital_enabled: true, 
    checkfile_ausgegebenesKapital: "Checkfile_ausgegebenesKapital.txt"
}
//At start
clearCheckfilesAtStart();


function writeFileToFolder(filename,text){
    //console.log("CFW: filename ",filename);

    fs.writeFileSync(dir+filename,text);
}

function clearCheckfilesAtStart(){
    for(key in config){
        if(config.hasOwnProperty(key)){
            var value = config[key];
            //console.log("CFW: key -> ",key);
            //console.log("CFW: value -> ",value);
            if(key && key.indexOf("enabled")==-1){
                writeFileToFolder(value,'');
            }
         }
    }
}

/**
 * Writes the filename string as headline to all active checkfiles in config
 * @param {string} filename 
 */
function writeAllFilenameHeaderToAllFiles(filename){
    for(key in config){
        if(config.hasOwnProperty(key)){
            var value = config[key];
            //console.log("CFW: key -> ",key);
            //console.log("CFW: value -> ",value);
            if(key && key.indexOf("enabled")==-1){
                var keyIsEnabled = key+"_enabled";
                var checkfileName = value;
                var checkfileIsEnabled = config[keyIsEnabled];
                writeHeaderToCheckFile(filename+"-----------------------------",
                        checkfileName,checkfileIsEnabled);
            }
         }
    }    
}
/**
 * Writes content of a header line to a checkfile to indicate which file the following contents with 'writeToCheckfile' 
 * belong.
 * @param {string} header ---> usually the filename 
 * @param {string} filetowrite filepath to which the entry gets written 
 * @param {string} activated the logging is active 
 */
function writeHeaderToCheckFile(header,filetowrite,activated){
    if(!activated)return; 
    try{
        fs.appendFileSync(dir+filetowrite,header + "\r\n");
    }catch(ex){
        console.log(" Exception ",ex);
    }
}
/**
 * Writes content of a certain line to a checkfile, also write the parsed content there, this is 
 * used for creating big checkfiles for validating parser functionality. 
 * @param {int} linenumber number of line related to the data of origin in the specified file 
 * @param {string} dataorigin datastring of the original data 
 * @param {object} dataparsed parsed interpreted data json-object 
 * @param {string} filetowrite filepath to which the entry gets written  
 * @param {boolean} activated the logging is active 
 */
function writeToCheckfile(linenumber,dataorigin,dataparsed,filetowrite,activated){
    if(!activated)return;
    var dir = './checkfiles/';
    try{
        //fs.appendFileSync(filetowrite,"line of origin:" +linenumber+ "\r\n"); //t necessary most of the time
        fs.appendFileSync(dir+filetowrite,"origin: "+dataorigin + " \r\n");
        fs.appendFileSync(dir+filetowrite,"parsed "+dataparsed+ "\r\n "); 
    }catch(ex){
        console.log(" Exception ",ex);
    }
}  


module.exports = {
    config, 
    writeHeaderToCheckFile,
    writeAllFilenameHeaderToAllFiles,
    writeToCheckfile
}