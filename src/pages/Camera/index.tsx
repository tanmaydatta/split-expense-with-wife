import React, { useState, useRef, useCallback, useEffect } from 'react';
import styled from 'styled-components';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import './index.css';

const CameraContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.medium};
  max-width: 800px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.spacing.medium};
`;

const VideoContainer = styled.div`
  position: relative;
  background: ${({ theme }) => theme.colors.dark};
  border-radius: ${({ theme }) => theme.borderRadius};
  overflow: hidden;
`;

const Video = styled.video`
  width: 100%;
  height: auto;
  max-height: 400px;
  display: block;
`;

const Canvas = styled.canvas`
  display: none;
`;

const PhotoPreview = styled.img`
  width: 100%;
  height: auto;
  max-height: 300px;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 2px solid ${({ theme }) => theme.colors.light};
`;

const ControlsContainer = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.small};
  flex-wrap: wrap;
  justify-content: center;
`;

const StatusMessage = styled.div<{ $type: 'success' | 'error' | 'info' }>`
  padding: ${({ theme }) => theme.spacing.small};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme, $type }) => 
    $type === 'success' ? theme.colors.success + '20' :
    $type === 'error' ? theme.colors.danger + '20' :
    theme.colors.info + '20'
  };
  color: ${({ theme, $type }) => 
    $type === 'success' ? theme.colors.success :
    $type === 'error' ? theme.colors.danger :
    theme.colors.info
  };
  border: 1px solid ${({ theme, $type }) => 
    $type === 'success' ? theme.colors.success :
    $type === 'error' ? theme.colors.danger :
    theme.colors.info
  };
  text-align: center;
`;

const CameraSelect = styled.select`
  padding: ${({ theme }) => theme.spacing.small};
  border: 1px solid ${({ theme }) => theme.colors.light};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.dark};
  font-size: ${({ theme }) => theme.fontSizes.medium};
`;

interface CameraDevice {
  deviceId: string;
  label: string;
}

const Camera: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [isStreaming, setIsStreaming] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Ready to start camera');
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  // Get available cameras
  const getCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      setCameras(videoDevices.map(device => ({
        deviceId: device.deviceId,
        label: device.label || `Camera ${device.deviceId.slice(0, 8)}`
      })));
      
      if (videoDevices.length > 0 && !selectedCamera) {
        setSelectedCamera(videoDevices[0].deviceId);
      }
    } catch (err) {
      console.error('Error getting cameras:', err);
      setError('Failed to get camera list');
    }
  }, [selectedCamera]);

  // Start camera stream
  const startCamera = useCallback(async () => {
    try {
      setError(null);
      setStatus('Starting camera...');

      // Stop existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: selectedCamera 
          ? { deviceId: { exact: selectedCamera } }
          : { facingMode },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsStreaming(true);
        setStatus('Camera is active');
      }
    } catch (err: any) {
      console.error('Error accessing camera:', err);
      setError(`Camera access failed: ${err.message}`);
      setStatus('Failed to start camera');
      setIsStreaming(false);
    }
  }, [selectedCamera, facingMode]);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setIsStreaming(false);
    setStatus('Camera stopped');
  }, []);

  // Capture photo
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) {
      setError('Video or canvas not available');
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) {
      setError('Canvas context not available');
      return;
    }

    // Set canvas dimensions to video dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw the video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to image data URL
    const photoDataUrl = canvas.toDataURL('image/png');
    setCapturedPhoto(photoDataUrl);
    setStatus('Photo captured!');
  }, []);

  // Download captured photo
  const downloadPhoto = useCallback(() => {
    if (!capturedPhoto) return;

    const link = document.createElement('a');
    link.download = `camera-test-${Date.now()}.png`;
    link.href = capturedPhoto;
    link.click();
  }, [capturedPhoto]);

  // Request camera permissions and get camera list on mount
  useEffect(() => {
    getCameras();
  }, [getCameras]);

  return (
    <CameraContainer data-test-id="camera-container">
      <Card>
        <h2>Camera Test</h2>
        <p>Test your device's camera functionality</p>
      </Card>

      {error && (
        <StatusMessage $type="error" data-test-id="error-message">
          {error}
        </StatusMessage>
      )}

      <StatusMessage 
        $type={isStreaming ? 'success' : 'info'} 
        data-test-id="status-message"
      >
        {status}
      </StatusMessage>

      {cameras.length > 0 && (
        <Card>
          <h3>Camera Selection</h3>
          <CameraSelect
            value={selectedCamera}
            onChange={(e) => setSelectedCamera(e.target.value)}
            data-test-id="camera-select"
          >
            {cameras.map((camera) => (
              <option key={camera.deviceId} value={camera.deviceId}>
                {camera.label}
              </option>
            ))}
          </CameraSelect>
        </Card>
      )}

      <Card>
        <h3>Camera Controls</h3>
        <ControlsContainer>
          <Button
            onClick={startCamera}
            disabled={isStreaming}
            data-test-id="start-camera-btn"
          >
            Start Camera
          </Button>
          
          <Button
            onClick={stopCamera}
            disabled={!isStreaming}
            data-test-id="stop-camera-btn"
          >
            Stop Camera
          </Button>
          
          <Button
            onClick={capturePhoto}
            disabled={!isStreaming}
            data-test-id="capture-photo-btn"
          >
            Capture Photo
          </Button>

          <Button
            onClick={() => setFacingMode(facingMode === 'user' ? 'environment' : 'user')}
            disabled={isStreaming}
            data-test-id="switch-camera-btn"
          >
            Switch to {facingMode === 'user' ? 'Back' : 'Front'} Camera
          </Button>
        </ControlsContainer>
      </Card>

      <VideoContainer>
        <Video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          data-test-id="camera-video"
        />
        <Canvas ref={canvasRef} />
      </VideoContainer>

      {capturedPhoto && (
        <Card>
          <h3>Captured Photo</h3>
          <PhotoPreview 
            src={capturedPhoto} 
            alt="Captured photo" 
            data-test-id="captured-photo"
          />
          <ControlsContainer>
            <Button
              onClick={downloadPhoto}
              data-test-id="download-photo-btn"
            >
              Download Photo
            </Button>
            <Button
              onClick={() => setCapturedPhoto(null)}
              data-test-id="clear-photo-btn"
            >
              Clear Photo
            </Button>
          </ControlsContainer>
        </Card>
      )}
    </CameraContainer>
  );
};

export default Camera; 