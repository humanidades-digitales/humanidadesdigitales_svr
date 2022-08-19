require('./models/Operation');
var express = require('express');
var multer = require('multer');

var bodyParser = require('body-parser');
const path = require('path');
var cors = require('cors');
const fs = require('fs');
const { mongoURI } = require('./config');
const mongoose = require('mongoose');

var app = express();
const Operation = mongoose.model('Operation');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

app.use(function(req, res, next) {
  if (req.is('text/*')) {
    req.text = '';
    req.setEncoding('utf8');
    req.on('data', function(chunk) {
      req.text += chunk;
    });
    req.on('end', next);
  } else {
    next();
  }
});

// Mongoose connect
const mongooseConnect = () => {
  mongoose.connect(mongoURI, {
    useNewUrlParser: true,
  });
};

mongooseConnect();

mongoose.connection.on('connected', () => {
  console.log('connected to MongoDB');
});
mongoose.connection.on('error', (err) =>
  console.log('Error connecting to mongo', err),
);

/// Retry connection
const connectWithRetry = () => {
  console.log('MongoDB connection with retry');
  return mongooseConnect();
};

/// Exit application on error
mongoose.connection.on('error', (err) => {
  console.log(`MongoDB connection error: ${err}`);
  setTimeout(connectWithRetry, 5000);
});

// Local storage setup

const __basedir = path.join(__dirname, '/uploads/');

var storage = multer.diskStorage({
  destination: function(req, file, callback) {
    const path = __basedir + req.query.uniqueId;
    fs.mkdirSync(path, { recursive: true });
    callback(null, path);
  },
  filename: function(req, file, callback) {
    callback(null, 'ocr-' + file.originalname);
  },
});
var upload = multer({ storage: storage }).single('files');

// API Calls

app.post('/files/upload', function(req, res) {
  upload(req, res, function(err) {
    if (err) {
      console.log(err);
      return res.end('Error uploading file.');
    }
    console.log('The filename is ' + res.req.file.filename);
    res.send(res.req.file.filename);
  });
});

app.get('/files/download/:uniqueId', async (req, res) => {
  const uniqueId = req.params['uniqueId'];
  const folderpath = __basedir + uniqueId;
  let operation = await Operation.findOne({ uniqueId: uniqueId }).lean();
  // zip archive of your folder is ready to download
  res.download(folderpath + `/ocrCorpus-${operation.dateEnd}.zip`);
});

app.get('/files/:uniqueId/:filename', function(req, res) {
  const filename = req.params['filename'];
  const directoryPath = __basedir + req.params['uniqueId'] + '/' + filename;
  fs.readFile(directoryPath, function(err, data) {
    if (err) {
      res.status(500).send({
        message: 'Unable to scan file!',
      });
    }
    res.status(200).send(data);
  });
});

app.get('/files', function(req, res) {
  const path = __basedir + req.query.uniqueId;
  fs.readdir(path, { withFileTypes: true }, function(err, files) {
    if (err) {
      res.status(500).send({
        message: 'Unable to scan files!',
      });
    }
    let fileInfos = [];
    files &&
      files.forEach((file) => {
        var fileObject = {
          source: file.name,
          options: {
            type: 'local',
          },
        };
        if (file.name[0] !== '.' && file.name.indexOf('.zip') === -1) {
          fileInfos.push(fileObject);
        }
      });
    files && res.status(200).send(fileInfos);
  });
});

app.delete('/files/:uniqueId/:filename', function(req, res) {
  const filename = req.params['filename'];
  const uniqueId = req.params['uniqueId'];
  if (!filename) {
    return res.status(500).json('error in delete');
  } else {
    try {
      fs.unlinkSync(__basedir + uniqueId + '/' + filename);
      return res.status(200).send('Successfully! File has been Deleted');
    } catch (err) {
      // handle the error
      return res.status(400).send(err);
    }
  }
});

app.delete('/files/:uniqueId', function(req, res) {
  var filename = req.text;
  const uniqueId = req.params['uniqueId'];
  if (!filename) {
    console.log('No file received');
    return res.status(500).json('error in delete');
  } else {
    console.log('file received and will be deleted');
    console.log(filename);
    try {
      fs.unlinkSync(__basedir + uniqueId + '/' + filename);
      return res.status(200).send('File has been deleted successfully.');
    } catch (err) {
      // handle the error
      return res.status(400).send(err);
    }
  }
});

app.get('/ocr/:uniqueId', async (req, res) => {
  const uniqueId = req.params['uniqueId'];

  console.log(`check if operation ${uniqueId} is active`);

  const operation = await Operation.findOne({
    uniqueId: uniqueId,
  }).lean();

  return res.status(200).send(operation);
});

app.post('/ocr/cancelAll', async (req, res) => {
  const uniqueId = req.query.uniqueId;
  const { exec } = require('child_process');

  const command = `ps -ef | awk '/ocrmypdf/ && /${uniqueId}/ && ! /awk/' | awk '{ print $2 }' |xargs kill -9`;
  console.log('cancel command', command);
  exec(command);
  let operation = await Operation.findOne({ uniqueId: uniqueId });
  Object.assign(operation, {
    isActive: false,
    ocrProcessed: false,
  });
  await operation.save();
  return res.status(200).send(operation);
});

app.post('/ocr/all', async (req, res) => {
  const uniqueId = req.query.uniqueId;
  const folderpath = __basedir + req.query.uniqueId + '/';

  const { spawn, execSync } = require('child_process');

  // Check if operation exists, otherwise create it
  let operation = await Operation.findOne({ uniqueId: uniqueId });
  if (!operation) {
    operation = new Operation();
    Object.assign(operation, {
      uniqueId,
      isActive: true,
      dateStart: Date.now(),
      ocrProcessed: false,
    });
  } else {
    Object.assign(operation, {
      isActive: true,
      dateStart: Date.now(),
      ocrProcessed: false,
    });
  }

  fs.readdir(folderpath, async (err, files) => {
    if (err) {
      res.status(500).send({
        message: 'Unable to scan files!',
      });
    }

    // First loop to delete zip and other extension files
    files.forEach((file) => {
      const filepath = folderpath + file;
      if (file.indexOf('.pdf') === -1) {
        fs.unlinkSync(filepath);
      }
    });

    // Take opportunity to set initial files length
    var filesLeft = files.length;
    Object.assign(operation, {
      filesLeft,
    });
    // first save
    await operation.save();

    // Second loop to process OCRs
    files.forEach(async (file, key, arr) => {
      const filepath = folderpath + file;

      const command = spawn('ocrmypdf', [
        '--output-type',
        'pdf',
        '--skip-text',
        '--l',
        'spa+eng',
        filepath,
        filepath,
      ]);
      command.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
      });

      command.stderr.on('data', (data) => {
        console.log(`stderr: ${data}`);
      });

      command.on('error', (error) => {
        console.log(`error: ${error.message}`);
      });

      command.on('close', async (code) => {
        console.log('closing file', key, 'of', arr.length, file);
        filesLeft = filesLeft - 1;
        console.log(filesLeft, 'files left');

        if (filesLeft) {
          await Operation.findOneAndUpdate(
            { uniqueId: uniqueId },
            {
              filesLeft,
            },
          );
        } else {
          const dateEnd = Date.now();
          await Operation.findOneAndUpdate(
            { uniqueId: uniqueId },
            {
              isActive: false,
              dateEnd,
              ocrProcessed: true,
              filesLeft,
            },
          );
          // Zip file
          execSync(`zip -r ocrCorpus-${dateEnd} *`, {
            cwd: folderpath,
          });
          console.log('operation closed');
        }
      });
    });
    return res.status(200).send({ operation });
  });
});

app.post('/search/all', async (req, res) => {
  const uniqueId = req.query.uniqueId;
  const term = req.query.term;
  const folderpath = __basedir + req.query.uniqueId;

  const { exec } = require('child_process');

  // Check if operation exists, otherwise create it
  let operation = await Operation.findOne({
    uniqueId: uniqueId,
    type: 'search',
  });
  if (!operation) {
    operation = new Operation();
    Object.assign(operation, {
      uniqueId,
      type: 'search',
      isActive: true,
      dateStart: Date.now(),
      searchProcessed: false,
    });
  } else {
    Object.assign(operation, {
      isActive: true,
      dateStart: Date.now(),
      searchProcessed: false,
    });
  }
  await operation.save();

  // Search in PDFs
  exec(
    `pdfgrep -n -i -H -r ${term} .`,
    { encoding: 'UTF-8', cwd: folderpath },
    (err, stdout, stderr) => {
      const output = stdout;
      console.log(output);
      return res.status(200).send(output);
    },
  );
});

app.listen(3000, function() {
  console.log('Working on port 3000');
});
