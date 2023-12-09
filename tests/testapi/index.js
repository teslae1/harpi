const express = require('express');
const app = express();

let validIds = [];

app.post('/item', (req, res) => {
    const id = Math.floor(Math.random() * 100);
    validIds.push(id);
    res.json({id: id});
});
app.get('/item/:id', (req, res) => {
    const id = req.params.id;
    if(!validIds.some(validId => validId == id)){
      res.status(404).send("Item not found by id: " + id);
    }

    res.status(200).send("Item found");
});
app.delete('/item/:id', (req, res) => {
    const id = req.params.id;
    if(!validIds.some(validId => validId == id)){
      res.status(404).send("Item not found by id: " + id);
    }

    const index = validIds.indexOf(id);
    validIds.splice(index, index);

    res.status(200).send("Item deleted");
});

const port = 8080;
const host = '0.0.0.0';

app.listen(port, host, () => {
  console.log('Server listening on port ' + port + " and hostname: " + host);
});