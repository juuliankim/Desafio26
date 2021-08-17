const express = require('express')
const session = require('express-session')
const handlebars = require('express-handlebars')
const app = express()
const http = require('http')
const server = http.Server(app)
const io = require('socket.io')(server)
const normalize = require('normalizr').normalize
const schema = require('normalizr').schema
const productos = require('./api/productos')
const Mensajes = require('./api/mensajes')
const passport = require('passport')
const bcrypt = require('bcrypt')
const LocalStrategy = require('passport-local').Strategy
const User = require('./models/users')

require('./database/connection')

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(express.static('public'))

passport.use('signup', new LocalStrategy({
    passReqToCallback: true
},
    function (req, username, password, done) {
        findOrCreateUser = function() {
            User.findOne({'username': username}, function(err, user) {
                if(err) {
                    console.log('Error en registro: ' + err)
                    return done(err)
                }
                if(user) {
                    console.log('El usuario ya existe')
                    return done(null, false,
                        console.log('El usuario ya existe'))
                } else {
                    var newUser = new User()
                    newUser.username = username
                    newUser.password = createHash(password)

                    newUser.save(function (err) {
                        if(err) {
                            console.log('Error al guardar usuario: ' + err)
                            throw err
                        }
                        console.log('Se registro al usuario con exito')
                        return done(null, newUser)
                    })
                }
            })
        }
        process.nextTick(findOrCreateUser)
    })
)

var createHash = function(password) {
    return bcrypt.hashSync(password, bcrypt.genSaltSync(10), null)
}

passport.use('login', new LocalStrategy({
    passReqToCallback: true
},
    function (req, username, password, done) {
        User.findOne({'username': username},
        function(err, user) {
            if(err)
                return done(err)
            if(!user) {
                console.log('User not found with username ' + username)
                return done(null, false,
                    console.log('message', 'User not found'))
            }
            if(!isValidPassword(user, password)) {
                console.log('Invalid Password')
                return done(null, false,
                    console.log('message', 'Invalid Password'))
            }
            return done(null, user)
        })
    })
)

var isValidPassword = function (user, password) {
    return bcrypt.compareSync(password, user.password)
}

passport.serializeUser(function (user, done) {
    done(null, user._id)
})

passport.deserializeUser(function (id, done) {
    User.findById(id, function (err, user) {
        done(err, user)
    })
})

app.use(passport.initialize())
app.use(passport.session())

const MongoStore = require('connect-mongo')
const advancedOptions = {useNewUrlParser: true, useUnifiedTopology: true}

app.use((err, req, res, next) =>{
    console.error(err.message)
    return res.status(500).send('Algo se rompió!!')
})

app.engine('hbs', handlebars({
    extname: '.hbs',
    defaultLayout: 'index.hbs',
    layoutsDir: __dirname + '/views/layouts'
}))

app.set("view engine", "hbs")
app.set("views", "./views")

// app.use(session({
//     store: MongoStore.create({
//         mongoUrl: 'mongodb+srv://juliankim:coderhouse@cluster0.jiary.mongodb.net/myFirstDatabase?retryWrites=true&w=majority',
//         mongoOptions: advancedOptions
//     }),
//     secret: 'secret',
//     resave: false,
//     saveUninitialized: false,
//     cookie: {
//         maxAge: 600000
//     }
// }))

app.get('/login', (req, res) => {
    if (req.isAuthenticated()) {
        var user = req.user;
        console.log('user logueado');
        res.render('vista', { showLogin: false, showContent: true, bienvenida: user.username, showBienvenida: true, bienvenida: user.username });
    }
    else {
        console.log('El usuario NO está logueado');
        res.render('vista', { showLogin: true, showContent: false, showBienvenida: false });
    }
})

app.get('/faillogin', (req, res) => {
    res.sendFile(__dirname + '/public/failLogin.html')
})

app.post('/login', passport.authenticate('login', { failureRedirect: '/faillogin' }), (req, res) => {
    res.render('vista', { showLogin: false, showContent: true, bienvenida: req.user.username, showBienvenida: true });
});

app.get('/logout', (req, res) => {
    req.logout();
    res.sendFile(__dirname + '/public/logout.html')
})

//

app.get('/signup', (req, res) => {
    res.render('register', {})
})

app.post('/signup', passport.authenticate('signup', { failureRedirect: '/failsignup' }), (req, res) => {
    var user = req.user;
    res.render('vista', { showLogin: false, showContent: true, bienvenida: user.username, showBienvenida: true });
})

app.get('/failsignup', (req, res) => {
    res.sendFile(__dirname + '/public/failSignup.html')
})

const productosRouter = require('./routes/productosRouter')
app.use('/api', productosRouter)
const mensajesRouter = require('./routes/mensajesRouter')
const { createHash } = require('crypto')
app.use('/api', mensajesRouter)

io.on('connection', async socket => {
    console.log('Usuario conectado')

    socket.on('nuevo-producto', nuevoProducto => {
        console.log(nuevoProducto)
        productos.guardar(nuevoProducto)
    })
    socket.emit('guardar-productos', () => {
        socket.on('notificacion', data => {
            console.log(data)
        })
    })

    socket.on("new-message", async function (data) {

        await Mensajes.guardar(data)

        let mensajesDB = await Mensajes.buscarTodo()     

        const autorSchema = new schema.Entity('autor', {}, { idAttribute: 'nombre' });

        const mensajeSchema = new schema.Entity('texto', {
            autor: autorSchema
        }, { idAttribute: '_id' })

        const mensajesSchema = new schema.Entity('mensajes', {
            msjs: [mensajeSchema]
        }, {idAttribute: 'id'})

        const mensajesNormalizados = normalize(mensajesDB, mensajesSchema)
        const messages = []
        messages.push(mensajesDB);

        console.log(mensajesDB)

        console.log(mensajesNormalizados)
            
        io.sockets.emit("messages", mensajesNormalizados)
    })
})

const PORT = 8080

const svr = server.listen(PORT, () => {
    console.log(`servidor escuchando en http://localhost:${PORT}`)
})

server.on('error', error => {
    console.log('error en el servidor:', error)
})