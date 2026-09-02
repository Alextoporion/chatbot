const mongoose=require('mongoose');
const mongo_url=process.env.MONGO_URL;
mongoose.connect(mongo_url)
.then(()=>{
    console.log("Database connected successfully");
})
.catch((err)=>{
    console.error("Error connecting to database:", err);
});