const mongoose = require('mongoose');

const operationSchema = new mongoose.Schema({
  uniqueId: Number,
  isActive: {
    type: Boolean,
    required: true,
  },
  ocrProcessed: Boolean,
  dateStart: String,
  dateEnd: String,
  filesLeft: Number,
  type: String,
});

mongoose.model('Operation', operationSchema);
