"use client";

import { useState, useEffect, useRef } from "react";
import io from 'socket.io-client';

// Get the current hostname for dynamic backend URL
const getBackendUrl = () => {
  const hostname = window.location.hostname;
  const port = 5000;
  return `http://${hostname}:${port}`;
};

const API_BASE_URL = `${getBackendUrl()}/api`;
const SOCKET_URL = getBackendUrl();

console.log('Backend URL:', API_BASE_URL);

// Simple custom components
const Button = ({ children, className = "", variant = "default", size = "default", ...props }) => {
  const baseStyles = "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none";
  const variants = {
    default: "bg-blue-600 text-white hover:bg-blue-700",
    destructive: "bg-red-600 text-white hover:bg-red-700",
    outline: "border border-gray-300 bg-white hover:bg-gray-50",
    secondary: "bg-gray-600 text-white hover:bg-gray-700",
    ghost: "hover:bg-gray-100"
  };
  const sizes = {
    default: "h-10 py-2 px-4",
    sm: "h-9 px-3",
    lg: "h-11 px-8",
    icon: "h-10 w-10"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

const Input = ({ className = "", ...props }) => (
  <input
    className={`flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
    {...props}
  />
);

const Label = ({ children, className = "", ...props }) => (
  <label
    className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`}
    {...props}
  >
    {children}
  </label>
);

const Card = ({ children, className = "" }) => (
  <div className={`rounded-lg border border-gray-200 bg-white shadow-sm ${className}`}>
    {children}
  </div>
);

const CardHeader = ({ children, className = "" }) => (
  <div className={`flex flex-col space-y-1.5 p-6 ${className}`}>
    {children}
  </div>
);

const CardTitle = ({ children, className = "" }) => (
  <h3 className={`text-2xl font-semibold leading-none tracking-tight ${className}`}>
    {children}
  </h3>
);

const CardContent = ({ children, className = "" }) => (
  <div className={`p-6 pt-0 ${className}`}>
    {children}
  </div>
);

const Avatar = ({ children, className = "" }) => (
  <div className={`relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full ${className}`}>
    {children}
  </div>
);

const AvatarFallback = ({ children, className = "" }) => (
  <div className={`flex h-full w-full items-center justify-center rounded-full bg-gray-100 ${className}`}>
    {children}
  </div>
);

// Icons
import { 
  Phone, 
  Video, 
  Mic, 
  MicOff, 
  VideoOff, 
  PhoneOff, 
  User, 
  Lock,
  LogOut,
  Menu,
  X,
  Wifi,
  WifiOff
} from "lucide-react";

export default function VideoCallingApp() {
  // Authentication state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: ""
  });

  // User state
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [serverInfo, setServerInfo] = useState(null);
  
  // Call state
  const [callState, setCallState] = useState("idle");
  const [activeCallUser, setActiveCallUser] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  
  // UI state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  
  // Refs
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);

  // Get server info on component mount
  useEffect(() => {
    const fetchServerInfo = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/info`);
        if (response.ok) {
          const info = await response.json();
          setServerInfo(info);
          console.log('Server info:', info);
        }
      } catch (error) {
        console.log('Could not fetch server info, using default URL');
      }
    };
    fetchServerInfo();
  }, []);

  // Socket connection
  useEffect(() => {
    if (isLoggedIn && currentUser) {
      try {
        socketRef.current = io(SOCKET_URL, {
          timeout: 10000,
          reconnectionAttempts: 5
        });
        
        socketRef.current.on('connect', () => {
          console.log('Connected to server');
          setConnectionStatus('connected');
          socketRef.current.emit('user-online', currentUser);
        });

        socketRef.current.on('disconnect', () => {
          console.log('Disconnected from server');
          setConnectionStatus('disconnected');
        });

        socketRef.current.on('connect_error', (error) => {
          console.error('Connection error:', error);
          setConnectionStatus('error');
        });
        
        socketRef.current.on('users-updated', (onlineUsers) => {
          const usersList = onlineUsers.map(user => ({
            ...user,
            isOnline: true
          }));
          setUsers(usersList);
        });

        socketRef.current.on('incoming-call', async (data) => {
          setIncomingCall({ from: data.from, offer: data.offer });
          setCallState("incoming-call");
          setActiveCallUser(data.from);
        });

        socketRef.current.on('call-accepted', async (data) => {
          if (peerConnectionRef.current) {
            await peerConnectionRef.current.setRemoteDescription(
              new RTCSessionDescription(data.answer)
            );
            setCallState("in-call");
          }
        });

        socketRef.current.on('call-rejected', () => {
          endCall();
          alert('Call was rejected');
        });

        socketRef.current.on('ice-candidate', (data) => {
          if (data.candidate && peerConnectionRef.current) {
            peerConnectionRef.current.addIceCandidate(
              new RTCIceCandidate(data.candidate)
            );
          }
        });

        socketRef.current.on('call-ended', () => {
          endCall();
        });

        return () => {
          socketRef.current?.disconnect();
        };
      } catch (error) {
        console.error('Socket connection error:', error);
      }
    }
  }, [isLoggedIn, currentUser]);

  // Initialize WebRTC
  const createPeerConnection = () => {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    };

    const pc = new RTCPeerConnection(configuration);

    // Add local stream to connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Handle remote stream
    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && activeCallUser && socketRef.current) {
        socketRef.current.emit('ice-candidate', {
          to: activeCallUser.id,
          candidate: event.candidate
        });
      }
    };

    return pc;
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setAuthForm(prev => ({ ...prev, [name]: value }));
  };

  // Handle login
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authForm.email,
          password: authForm.password
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        localStorage.setItem('token', data.token);
        setCurrentUser(data.user);
        setIsLoggedIn(true);
        await initializeMediaDevices();
      } else {
        alert(data.error);
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('Login failed: ' + error.message);
    }
  };

  // Handle registration
  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm)
      });

      const data = await response.json();
      
      if (response.ok) {
        localStorage.setItem('token', data.token);
        setCurrentUser(data.user);
        setIsLoggedIn(true);
        await initializeMediaDevices();
      } else {
        alert(data.error);
      }
    } catch (error) {
      console.error('Registration error:', error);
      alert('Registration failed: ' + error.message);
    }
  };

  // Initialize camera and microphone
  const initializeMediaDevices = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      localStreamRef.current = stream;
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Error accessing media devices:', error);
      alert('Could not access camera/microphone. Please check permissions.');
    }
  };

  // Handle logout
  const handleLogout = () => {
    endCall();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    socketRef.current?.disconnect();
    localStorage.removeItem('token');
    setIsLoggedIn(false);
    setCurrentUser(null);
    setAuthForm({ name: "", email: "", password: "" });
    setIsRegistering(false);
    setConnectionStatus('disconnected');
  };

  // Start a call
  const startCall = async (user) => {
    if (!user.isOnline) return;

    setActiveCallUser(user);
    setCallState("calling");
    setIsSidebarOpen(false);

    try {
      peerConnectionRef.current = createPeerConnection();
      
      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);

      socketRef.current?.emit('call-user', {
        to: user.id,
        offer: offer,
        caller: currentUser
      });
    } catch (error) {
      console.error('Error starting call:', error);
      endCall();
    }
  };

  // Accept incoming call
  const acceptCall = async () => {
    if (!incomingCall) return;

    setCallState("in-call");
    
    try {
      peerConnectionRef.current = createPeerConnection();
      await peerConnectionRef.current.setRemoteDescription(
        new RTCSessionDescription(incomingCall.offer)
      );

      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);

      socketRef.current?.emit('call-accepted', {
        to: incomingCall.from.id,
        answer: answer
      });

      setIncomingCall(null);
    } catch (error) {
      console.error('Error accepting call:', error);
      endCall();
    }
  };

  // Reject incoming call
  const rejectCall = () => {
    if (incomingCall) {
      socketRef.current?.emit('call-rejected', {
        to: incomingCall.from.id
      });
    }
    setIncomingCall(null);
    setCallState("idle");
    setActiveCallUser(null);
  };

  // End current call
  const endCall = () => {
    if (activeCallUser && socketRef.current) {
      socketRef.current.emit('end-call', {
        to: activeCallUser.id
      });
    }
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setCallState("idle");
    setActiveCallUser(null);
    setIncomingCall(null);
    setIsMuted(false);
    setIsVideoOff(false);
  };

  // Toggle mute
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  // Toggle video
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = isVideoOff;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  // Toggle sidebar
  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  // Load users
  useEffect(() => {
    const loadUsers = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const response = await fetch(`${API_BASE_URL}/users`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          if (response.ok) {
            const usersData = await response.json();
            setUsers(usersData);
          }
        } catch (error) {
          console.error('Error loading users:', error);
        }
      }
    };

    if (isLoggedIn) {
      loadUsers();
    }
  }, [isLoggedIn]);

  // Login/Register form
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">
              {isRegistering ? "Create Account" : "VideoCall App"}
            </CardTitle>
            <p className="text-gray-600">
              {isRegistering ? "Sign up to start video calling" : "Sign in to your account"}
            </p>
            {serverInfo && (
              <div className="text-xs text-gray-500 bg-gray-100 p-2 rounded">
                Server: {serverInfo.backendUrl}
              </div>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-4">
              {isRegistering && (
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="name"
                      name="name"
                      value={authForm.name}
                      onChange={handleInputChange}
                      placeholder="Enter your name"
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={authForm.email}
                    onChange={handleInputChange}
                    placeholder="Enter your email"
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    value={authForm.password}
                    onChange={handleInputChange}
                    placeholder="Enter your password"
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              
              <Button type="submit" className="w-full">
                {isRegistering ? "Sign Up" : "Sign In"}
              </Button>
            </form>
            
            <div className="mt-4 text-center text-sm">
              {isRegistering ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                onClick={() => setIsRegistering(!isRegistering)}
                className="text-blue-600 hover:underline"
              >
                {isRegistering ? "Sign In" : "Sign Up"}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main app
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 p-4 sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Video className="h-8 w-8 text-blue-600" />
            <h1 className="text-xl font-bold">VideoCall</h1>
            <div className="flex items-center space-x-1 text-sm">
              {connectionStatus === 'connected' ? (
                <Wifi className="h-4 w-4 text-green-500" />
              ) : (
                <WifiOff className="h-4 w-4 text-red-500" />
              )}
              <span className={`text-xs ${connectionStatus === 'connected' ? 'text-green-600' : 'text-red-600'}`}>
                {connectionStatus}
              </span>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={toggleSidebar}
              className="md:hidden"
            >
              {isSidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
            
            <div className="hidden md:flex items-center space-x-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback>
                  {currentUser?.name?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium max-w-[100px] truncate">{currentUser?.name}</span>
            </div>
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleLogout}
              className="flex items-center space-x-1"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden md:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div 
          className={`absolute md:relative z-20 md:z-0 inset-y-0 left-0 transform ${
            isSidebarOpen ? "translate-x-0" : "-translate-x-full"
          } md:translate-x-0 transition-transform duration-300 ease-in-out w-80 bg-white border-r border-gray-200 flex flex-col md:flex`}
        >
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Users ({users.length})</h2>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {users.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                No other users online
              </div>
            ) : (
              users
                .filter(user => user.id !== currentUser?.id)
                .map(user => (
                  <div 
                    key={user.id} 
                    className="flex items-center justify-between p-4 border-b border-gray-100 hover:bg-gray-50"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="relative">
                        <Avatar>
                          <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${
                          user.isOnline ? 'bg-green-500' : 'bg-gray-400'
                        }`}></div>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{user.name}</p>
                        <p className="text-sm text-gray-600 truncate">{user.email}</p>
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      onClick={() => startCall(user)}
                      disabled={callState !== "idle" || !user.isOnline}
                    >
                      <Phone className="h-4 w-4" />
                    </Button>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* Mobile overlay */}
        {isSidebarOpen && (
          <div 
            className="fixed inset-0 z-10 bg-black bg-opacity-50 md:hidden"
            onClick={toggleSidebar}
          ></div>
        )}

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Video Area */}
          <div className="flex-1 bg-gray-900 relative">
            {callState === "idle" ? (
              <div className="h-full flex items-center justify-center p-4">
                <div className="text-center max-w-md">
                  <Video className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-white mb-2">Ready to Video Call</h2>
                  <p className="text-gray-400 mb-6">
                    {users.filter(u => u.isOnline && u.id !== currentUser?.id).length > 0 
                      ? "Select an online user to start a call" 
                      : "No other users online"}
                  </p>
                  <Button onClick={toggleSidebar} className="md:hidden">
                    <Menu className="h-4 w-4 mr-2" />
                    Show Users
                  </Button>
                  {serverInfo && (
                    <div className="text-xs text-gray-500 mt-4">
                      Connected to: {serverInfo.backendUrl}
                    </div>
                  )}
                </div>
              </div>
            ) : callState === "incoming-call" ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center bg-gray-800 p-8 rounded-lg">
                  <Avatar className="h-24 w-24 mx-auto mb-4">
                    <AvatarFallback className="text-2xl">
                      {incomingCall?.from.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <h3 className="text-2xl font-bold text-white mb-2">
                    Incoming Call from {incomingCall?.from.name}
                  </h3>
                  <div className="flex space-x-4 justify-center mt-6">
                    <Button 
                      onClick={rejectCall}
                      variant="destructive"
                      className="h-12 w-12 rounded-full"
                    >
                      <PhoneOff className="h-6 w-6" />
                    </Button>
                    <Button 
                      onClick={acceptCall}
                      className="h-12 w-12 rounded-full bg-green-600 hover:bg-green-700"
                    >
                      <Phone className="h-6 w-6" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full relative">
                {/* Remote Video */}
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                
                {/* Local Video Preview */}
                <div className="absolute bottom-4 right-4 w-32 h-24 md:w-48 md:h-36 bg-gray-900 rounded-lg overflow-hidden border-2 border-white">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Calling overlay */}
                {callState === "calling" && (
                  <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center">
                    <div className="text-center">
                      <Avatar className="h-24 w-24 mx-auto mb-4">
                        <AvatarFallback className="text-2xl">
                          {activeCallUser?.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <h3 className="text-2xl font-bold text-white mb-2">
                        Calling {activeCallUser?.name}
                      </h3>
                      <p className="text-gray-400">Waiting for answer...</p>
                      <Button onClick={endCall} variant="destructive" className="mt-4">
                        <PhoneOff className="h-4 w-4 mr-2" />
                        Cancel Call
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Call Controls */}
          {callState === "in-call" && (
            <div className="bg-gray-800 p-4">
              <div className="flex items-center justify-center space-x-6">
                <Button 
                  size="icon" 
                  variant="secondary" 
                  onClick={toggleMute}
                  className={`h-12 w-12 ${isMuted ? "bg-red-500 hover:bg-red-600" : ""}`}
                >
                  {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </Button>
                
                <Button 
                  size="icon" 
                  variant="secondary" 
                  onClick={toggleVideo}
                  className={`h-12 w-12 ${isVideoOff ? "bg-red-500 hover:bg-red-600" : ""}`}
                >
                  {isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                </Button>
                
                <Button 
                  size="icon" 
                  variant="destructive" 
                  onClick={endCall}
                  className="h-14 w-14"
                >
                  <PhoneOff className="h-6 w-6" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}