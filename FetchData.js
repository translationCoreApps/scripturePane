// FetchData.js//
import fs from 'fs-extra';
import pathex from 'path-extra';
import path from 'path';
import * as parser from 'usfm-parser';
import BooksOfBible from './js/BooksOfBible.js';
// constant delcaration
const NAMESPACE = "ScripturePane";
const defaultSave = path.join(pathex.homedir(), 'translationCore');
const api = window.ModuleApi;
var missingChunks = 0;


export default function fetchData(projectDetails, bibles, actions, progress) {
  return new Promise(function (resolve, reject) {
    /**
      * @description Fetch data.
      * @param {function} addNewBible - redux action to save a bible to
      * the resources reducer.
      *        @example take in two arguments bible name/version and bible data
      * @param {function} addNewResource - redux action to save a resource to
      * the resources reducer.
      *        @example take in two arguments resource name and resource data
      * @param {function} progress - updates the progress of the fetch data process.
      * @param {function} setModuleSettings - redux action that handles adding modules settings.
      */
    const params = projectDetails.params;
    const tcManifest = projectDetails.manifest;
    const { addNewBible, addNewResource, setModuleSettings } = actions;
    /**
    * @description The code  below sets the default settings for the three
    *  initial panes (originalLanguage, gatewayLanguage and targetLanguage)
    *  As the user adds or removes panes from the scripture pane the current Pane
    *  Settings will change based on the specicic settings of each pane in the current
    *  PaneSettings array in the checkstore.
    ******************************************************************************/
    let targetLanguageName = "";
    let gatewayLanguageName = "";
    let gatewayLanguageVersion = "";
    let originalLanguageName = "";
    let bookAbbr = "";
    if (tcManifest && tcManifest.target_language) {
      targetLanguageName = tcManifest.target_language.name;
    }
    if (tcManifest && (tcManifest.source_translations.length !== 0)) {
      gatewayLanguageName = tcManifest.source_translations[0].language_id.toUpperCase();
      gatewayLanguageVersion = " (" + tcManifest.source_translations[0].resource_id.toUpperCase() + ")";
    }
    let gatewayLanguageHeading = {
      heading: gatewayLanguageName + " " + gatewayLanguageVersion,
      headingDescription: "Gateway Language"
    }
    let targetLanguageHeading = {
      heading: targetLanguageName,
      headingDescription: "Target Language"
    }
    let UDBHeading = {
      heading: gatewayLanguageName + " (UDB)",
      headingDescription: "Gateway Language"
    }
    if (tcManifest.ts_project) {
      bookAbbr = tcManifest.ts_project.id;
    }
    else if (tcManifest.project) {
      bookAbbr = tcManifest.project.id;
    }
    else {
      bookAbbr = tcManifest.project_id;
    }

    if (isOldTestament(bookAbbr)) {
      originalLanguageName = "Hebrew";
    } else {
      originalLanguageName = "Greek (UGNT)";
    }

    let originalLanguageHeading = {
      heading: originalLanguageName,
      headingDescription: "Original Language"
    }
    let staticPaneSettings = [
      {
        sourceName: "originalLanguage",
        dir: "ltr",
        heading: originalLanguageHeading
      },
      {
        sourceName: "gatewayLanguage",
        dir: "ltr",
        heading: gatewayLanguageHeading
      },
      {
        sourceName: "targetLanguage",
        dir: null,
        heading: targetLanguageHeading
      },
      {
        sourceName: "UDB",
        dir: 'ltr',
        heading: UDBHeading
      }
    ];
    let currentPaneSettings = [
      {
        sourceName: "gatewayLanguage",
        dir: "ltr",
        heading: gatewayLanguageHeading
      }
    ];
    setModuleSettings(NAMESPACE, 'currentPaneSettings', currentPaneSettings);
    setModuleSettings(NAMESPACE, 'staticPaneSettings', staticPaneSettings);

    /**
    * @description
    * Get original language
    * check if original language is already in common
    * get it if it isn't using parsers and params
    ******************************************************************************/
    function getTargetLanguage() {
      return new Promise((resolve, reject) => {
        if (bibles.targetLanguage) resolve();
        else sendToReader(params.targetLanguagePath, tcManifest, addNewBible, resolve);
      });
    }
    function getOriginalLanguage() {
      return new Promise((resolve, reject) => {
        var originalPath = path.join(params.originalLanguagePath, bookAbbreviationToBookPath(params.bookAbbr))
        readInOriginal(originalPath, params, addNewBible, resolve);
      });
    }
    function getUDB() {
      return new Promise((resolve, reject) => {
        var gatewayLanguageUDBPath = path.join(window.__base, 'static', 'taggedUDB');
        parseUSFM(gatewayLanguageUDBPath, params.bookAbbr, addNewBible, resolve)
      });
    }

    getTargetLanguage().then(()=>{
      progress(33);
      getOriginalLanguage();
    }).then(()=>{
      progress(66);
      getUDB();
    }).then(()=>{
      progress(100);
      resolve();
    });

    function isOldTestament(projectBook) {
      var passedBook = false;
      for (var book in BooksOfBible) {
        if (book == projectBook) passedBook = true;
        if (BooksOfBible[book] == "Malachi" && passedBook) {
          return true;
        }
      }
      return false;
    }


    function parseUSFM(savePath, bookAbbr, addNewBible, callback) {
      var projectFolder = fs.readdirSync(savePath);
      var targetLanguage;
      for (var file in projectFolder) {
        var parsedPath = path.parse(projectFolder[file]);
        if ((parsedPath.ext.toUpperCase() == ".SFM" || parsedPath.ext.toUpperCase() == '.USFM') && parsedPath.name.includes(bookAbbr.toUpperCase())) {
          var actualFile = path.join(savePath, parsedPath.base);
          try {
            var data = fs.readFileSync(actualFile);
          } catch (err) {
            console.warn("There was an error getting the UDB")
          }
          var usfmData = data.toString();
          var parsedUSFM = parser.toJSON(usfmData);
          if (parsedUSFM.headers['id']) parsedUSFM.book = parsedUSFM.headers['id'].split(" ")[0].toLowerCase();
          targetLanguage = saveUDBinAPI(parsedUSFM, addNewBible);
        }
      }
      callback();
    }

    function saveUDBinAPI(parsedUSFM, addNewBible) {
      var targetLanguage = {};
      targetLanguage.title = parsedUSFM.book;
      // targetLanguage.header = parsedUSFM.headers;
      var chapters = parsedUSFM.chapters;
      for (var ch in chapters) {
        targetLanguage[chapters[ch].number] = {};
        var verses = chapters[ch].verses;
        for (var v in verses) {
          var verseText = verses[v].text.trim();
          targetLanguage[chapters[ch].number][verses[v].number] = verseText;
        }
      }
      if (parsedUSFM.headers) {
        var parsedHeaders = parsedUSFM.headers;
        if (parsedHeaders['mt1']) {
          targetLanguage.title = parsedHeaders['mt1'];
        } else if (parsedHeaders['id']) {
          targetLanguage.title = books[parsedHeaders['id'].toLowerCase()];
        }
      }
      addNewBible('UDB', targetLanguage);
      return targetLanguage;
    }

    function bookAbbreviationToBookPath(bookAbbr) {
      var bookName = api.convertToFullBookName(bookAbbr);
      bookName =  bookName.replace(/\s/g, '') + '.json';
      return bookName;
    }

    /**
    * @description This function is used to send a file path to the readFile()
    * module
    * @param {string} file The path of the directory as specified by the user.
    ******************************************************************************/
    function sendToReader(file, data, addNewBible, done) {
      try {
        // FileModule.readFile(path.join(file, 'manifest.json'), readInManifest);
        readInManifest(data, file, addNewBible, done);
      } catch (error) {
        console.error(error);
      }
    }
    /**
    * @description This function takes the manifest file and parses it to JSON.
    * @param {string} manifest - The manifest.json file
    ******************************************************************************/
    function readInManifest(manifest, source, addNewBible, callback) {
      var bookTitle;
      if (manifest.ts_project) {
        bookTitle = manifest.ts_project.name;
      } else {
        bookTitle = manifest.project.name;
      }
      let bookTitleSplit = bookTitle.split(' ');
      var bookName = bookTitleSplit.join('');
      let bookFileName = bookName + '.json';
      let finishedChunks = manifest.finished_chunks || manifest.finished_frames;
      var total = len(finishedChunks);
      let currentJoined = {};
      var done = 0;
      for (let chapterVerse in finishedChunks) {
        if (finishedChunks.hasOwnProperty(chapterVerse)) {
          let splitted = finishedChunks[chapterVerse].split('-');
          openUsfmFromChunks(splitted, currentJoined, total, source, function () {
            done++;
            if (done >= total - missingChunks) {
              missingChunks = 0;
              addNewBible('targetLanguage', currentJoined);
              callback();
            }
          });
        }
      }
    }

    function readInOriginal(path, params, addNewBible, callback) {
      var bookAbbr = params.bookAbbr;
      var originalLanguage = params.originalLanguage;
      try {
        var data = fs.readFileSync(path).toString();
        if (!data) { } else {
          var betterData = typeof data == 'object' ? JSON.stringify(data) : data;
          var origText = openOriginal(betterData, api.convertToFullBookName(bookAbbr));
          if (originalLanguage == "hebrew") {
            parseHebrew(addNewBible, origText);
          } else {
            parseGreek(addNewBible, origText);
          }
          callback();
        }
      } catch (error) {
        console.log(error);
      }
    }

    /**
    * @description This function opens the chunks defined in the manifest file.
    * @param {array} chunk - An array of the chunks defined in manifest
    ******************************************************************************/
    function openUsfmFromChunks(chunk, currentJoined, totalChunk, source, callback) {
      let currentChapter = chunk[0];
      try {
        currentChapter = parseInt(currentChapter);
        var fileName = chunk[1] + '.txt';
        var chunkLocation = path.join(source, chunk[0], fileName);
        var data = fs.readFileSync(chunkLocation);
        if (!data) { }
        joinChunks(data.toString(), currentChapter, currentJoined);
        callback();
      } catch (error) {
        missingChunks++;
      }
    }

    /**
    * @description This function saves the chunks locally as a window object;
    * @param {string} text - The text being read in from chunks
    ******************************************************************************/
    function joinChunks(text, currentChapter, currentJoined) {
      currentChapter = parseInt(currentChapter);
      if (currentChapter == 0) {
        currentJoined.title = text;
      } else {
        if (currentJoined[currentChapter] === undefined) {
          currentJoined[currentChapter] = {};
        }
        var currentChunk = parser.toJSON(text).chapters[0];
        for (let verse in currentChunk.verses) {
          if (currentChunk.verses.hasOwnProperty(verse)) {
            var currentVerse = currentChunk.verses[verse];
            currentJoined[currentChapter][verse] = currentVerse;
          }
        }
      }
    }

    /**
    * @description This function processes the original text.
    * @param {string} text - The text being read from the JSON bible object
    ******************************************************************************/
    function openOriginal(text, bookName) {
      var input = JSON.parse(text);
      input[bookName].title = bookName;
      var newData = {};
      for (var chapter in input[bookName]) {
        newData[parseInt(chapter)] = {};
        for (var verse in input[bookName][chapter]) {
          newData[parseInt(chapter)][parseInt(verse)] = input[bookName][chapter][verse];
        }
      }
      // CoreActions.updateOriginalLanguage(input[bookName]);
      //make new function to put straight into common as array?
      return input[bookName];
    }

    function len(obj) {
      var length = 0;
      for (let item in obj) {
        length++;
      }
      return length;
    }

    /**
      * @author Evan Wiederspan
      * @description parses the incoming greek and modifies it to be ready
    */
    function parseGreek(addNewBible, origText) {
      var lex = require("./static/Lexicon.json");
      let parsedText = {};
      for (let ch in origText) {
        if (!parseInt(ch)) {
          // skip the title
          continue;
        }
        parsedText[ch] = {};
        let chap = origText[ch];
        for (let v in chap) {
          let origVerseFull = origText[ch][v];
          let origVerse = origVerseFull.split(" ");
          let verse = parsedText[ch][v] = [];
          var word;
          var strong = "Strong Missing";
          var brief = "Brief Missing";
          var long = "Long Missing";
          for (var element in origVerse) {
            try {
              var currentElement = origVerse[element];
              var nextElement = origVerse[parseInt(element) + 1];
              if (isNaN(currentElement[currentElement.length - 1]) && !isNaN(nextElement[nextElement.length - 1])) {
                word = currentElement;
                strong = nextElement;
                brief = lex[strong].brief;
                long = lex[strong].long;
                verse.push({ word, strong, brief, long });
              }
            } catch (e) {
              if (word) {
                //verse.push({ word, strong, brief });
              }
            }
          }
        }
      }
      addNewBible('originalLanguage', parsedText);
    }

    function parseHebrew(addNewBible, origText) {
      var lex = require("./static/HebrewLexicon.json");
      let parsedText = {};
      for (let ch in origText) {
        if (!parseInt(ch)) {
          // skip the title
          continue;
        }
        parsedText[ch] = {};
        let chap = origText[ch];
        for (let v in chap) {
          let origVerseFull = origText[ch][v];
          let origVerse = origVerseFull.split(" ");
          let verse = parsedText[ch][v] = [];
          var word;
          var strong = "Strong Missing";
          var brief = "Brief Missing";
          for (var element in origVerse) {
            try {
              var currentElement = origVerse[element];
              var nextElement = origVerse[parseInt(element) + 1];
              if (isNaN(currentElement[currentElement.length - 1]) && !isNaN(nextElement[nextElement.length - 1])) {
                word = currentElement;
                strong = nextElement;
                brief = lex[strong].strongs_def;
                verse.push({ word, strong, brief });
              }
            } catch (e) {
              if (word) {
                //verse.push({ word, strong, brief });
              }
            }
          }
        }
      }
      addNewBible('originalLanguage', parsedText);
    }
  })
}
