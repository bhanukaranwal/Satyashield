import asyncio
import numpy as np
import cv2
import torch
import torch.nn.functional as F
from typing import Dict, List, Optional, Union
import logging
import time
import os
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor
import hashlib

from models.deepfake_detector import DeepfakeDetector, DeepfakeResult
from utils.preprocessing import VideoPreprocessor, AudioPreprocessor
from utils.model_utils import ModelManager

logger = logging.getLogger(__name__)

@dataclass
class DeepfakeAnalysisRequest:
    file_path: str
    file_type: str  # 'video', 'image', 'audio'
    analysis_id: str
    user_id: str
    priority: int = 1  # 1=normal, 2=high, 3=critical

class DeepfakeService:
    """Advanced deepfake detection service with real-time processing capabilities"""
    
    def __init__(self, model_manager: ModelManager):
        self.model_manager = model_manager
        self.detector = None
        self.video_preprocessor = VideoPreprocessor()
        self.audio_preprocessor = AudioPreprocessor()
        self.executor = ThreadPoolExecutor(max_workers=4)
        
        # Processing queues for different priorities
        self.queues = {
            1: asyncio.Queue(maxsize=100),  # Normal priority
            2: asyncio.Queue(maxsize=50),   # High priority
            3: asyncio.Queue(maxsize=20),   # Critical priority
        }
        
        self.processing_results = {}
        self.is_running = False
        
    async def initialize(self):
        """Initialize the deepfake detection models"""
        try:
            logger.info("Initializing deepfake detection service...")
            
            # Load deepfake detector
            model_path = await self.model_manager.get_model_path('deepfake_detector')
            self.detector = DeepfakeDetector(model_path)
            
            # Start processing workers
            await self._start_workers()
            
            self.is_running = True
            logger.info("Deepfake detection service initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize deepfake service: {e}")
            raise
    
    async def _start_workers(self):
        """Start background workers for processing requests"""
        # Start workers for each priority level
        for priority in [3, 2, 1]:  # Process high priority first
            for _ in range(2):  # 2 workers per priority level
                asyncio.create_task(self._process_queue(priority))
    
    async def _process_queue(self, priority: int):
        """Process requests from a specific priority queue"""
        queue = self.queues[priority]
        
        while True:
            try:
                # Wait for a request
                request = await queue.get()
                
                logger.info(f"Processing deepfake analysis request", extra={
                    'analysis_id': request.analysis_id,
                    'priority': priority,
                    'file_type': request.file_type
                })
                
                # Process the request
                result = await self._process_deepfake_request(request)
                
                # Store result
                self.processing_results[request.analysis_id] = result
                
                # Mark task as done
                queue.task_done()
                
            except Exception as e:
                logger.error(f"Error processing deepfake request: {e}")
                if 'request' in locals():
                    self.processing_results[request.analysis_id] = {
                        'status': 'failed',
                        'error': str(e),
                        'timestamp': time.time()
                    }
    
    async def submit_analysis(self, file_path: str, file_type: str, 
                            user_id: str, priority: int = 1) -> str:
        """Submit a file for deepfake analysis"""
        # Generate analysis ID
        analysis_id = self._generate_analysis_id(file_path, user_id)
        
        # Create request
        request = DeepfakeAnalysisRequest(
            file_path=file_path,
            file_type=file_type,
            analysis_id=analysis_id,
            user_id=user_id,
            priority=priority
        )
        
        # Add to appropriate queue
        try:
            await self.queues[priority].put(request)
            
            # Store initial status
            self.processing_results[analysis_id] = {
                'status': 'queued',
                'timestamp': time.time(),
                'file_type': file_type
            }
            
            logger.info(f"Deepfake analysis queued", extra={
                'analysis_id': analysis_id,
                'priority': priority,
                'file_type': file_type
            })
            
            return analysis_id
            
        except Exception as e:
            logger.error(f"Failed to queue deepfake analysis: {e}")
            raise
    
    async def _process_deepfake_request(self, request: DeepfakeAnalysisRequest) -> Dict:
        """Process a deepfake detection request"""
        start_time = time.time()
        
        try:
            # Update status
            self.processing_results[request.analysis_id] = {
                'status': 'processing',
                'timestamp': time.time(),
                'file_type': request.file_type
            }
            
            # Process based on file type
            if request.file_type == 'video':
                result = await self._analyze_video(request.file_path)
            elif request.file_type == 'image':
                result = await self._analyze_image(request.file_path)
            elif request.file_type == 'audio':
                result = await self._analyze_audio(request.file_path)
            else:
                raise ValueError(f"Unsupported file type: {request.file_type}")
            
            processing_time = time.time() - start_time
            
            # Prepare final result
            final_result = {
                'status': 'completed',
                'analysis_id': request.analysis_id,
                'file_type': request.file_type,
                'result': {
                    'is_deepfake': result.is_deepfake,
                    'confidence': result.confidence,
                    'overall_score': result.confidence * 100,
                    'anomalies': result.anomalies or [],
                    'frame_level_analysis': result.frame_level_results,
                    'audio_analysis': result.audio_result,
                    'processing_time': processing_time
                },
                'timestamp': time.time(),
                'processing_time': processing_time
            }
            
            logger.info(f"Deepfake analysis completed", extra={
                'analysis_id': request.analysis_id,
                'is_deepfake': result.is_deepfake,
                'confidence': result.confidence,
                'processing_time': processing_time
            })
            
            return final_result
            
        except Exception as e:
            logger.error(f"Deepfake analysis failed: {e}")
            return {
                'status': 'failed',
                'analysis_id': request.analysis_id,
                'error': str(e),
                'timestamp': time.time(),
                'processing_time': time.time() - start_time
            }
    
    async def _analyze_video(self, file_path: str) -> DeepfakeResult:
        """Analyze video file for deepfake content"""
        loop = asyncio.get_event_loop()
        
        # Run in thread pool to avoid blocking
        return await loop.run_in_executor(
            self.executor,
            self.detector.analyze_video,
            file_path
        )
    
    async def _analyze_image(self, file_path: str) -> DeepfakeResult:
        """Analyze image file for deepfake content"""
        loop = asyncio.get_event_loop()
        
        return await loop.run_in_executor(
            self.executor,
            self.detector.analyze_image,
            file_path
        )
    
    async def _analyze_audio(self, file_path: str) -> DeepfakeResult:
        """Analyze audio file for synthetic content"""
        # This would integrate with audio deepfake detection
        # For now, return a placeholder result
        return DeepfakeResult(
            is_deepfake=False,
            confidence=0.0,
            frame_level_results=[],
            processing_time=1.0,
            anomalies=["Audio analysis not yet implemented"]
        )
    
    def get_analysis_result(self, analysis_id: str) -> Optional[Dict]:
        """Get analysis result by ID"""
        return self.processing_results.get(analysis_id)
    
    def get_analysis_status(self, analysis_id: str) -> str:
        """Get current status of analysis"""
        result = self.processing_results.get(analysis_id)
        return result['status'] if result else 'not_found'
    
    async def batch_analyze(self, file_paths: List[str], file_types: List[str], 
                           user_id: str, priority: int = 1) -> List[str]:
        """Submit multiple files for analysis"""
        analysis_ids = []
        
        for file_path, file_type in zip(file_paths, file_types):
            analysis_id = await self.submit_analysis(file_path, file_type, user_id, priority)
            analysis_ids.append(analysis_id)
        
        return analysis_ids
    
    async def wait_for_completion(self, analysis_id: str, timeout: int = 300) -> Dict:
        """Wait for analysis to complete with timeout"""
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            result = self.get_analysis_result(analysis_id)
            
            if result and result['status'] in ['completed', 'failed']:
                return result
            
            await asyncio.sleep(1)
        
        raise TimeoutError(f"Analysis {analysis_id} did not complete within {timeout} seconds")
    
    def _generate_analysis_id(self, file_path: str, user_id: str) -> str:
        """Generate unique analysis ID"""
        content = f"{file_path}_{user_id}_{time.time()}"
        return hashlib.sha256(content.encode()).hexdigest()[:16]
    
    def get_queue_status(self) -> Dict[int, int]:
        """Get current queue sizes"""
        return {priority: queue.qsize() for priority, queue in self.queues.items()}
    
    def cleanup_old_results(self, max_age_hours: int = 24):
        """Clean up old analysis results"""
        current_time = time.time()
        max_age_seconds = max_age_hours * 3600
        
        to_remove = []
        for analysis_id, result in self.processing_results.items():
            if current_time - result['timestamp'] > max_age_seconds:
                to_remove.append(analysis_id)
        
        for analysis_id in to_remove:
            del self.processing_results[analysis_id]
        
        logger.info(f"Cleaned up {len(to_remove)} old analysis results")
    
    async def shutdown(self):
        """Shutdown the deepfake service"""
        logger.info("Shutting down deepfake detection service...")
        
        self.is_running = False
        
        # Wait for queues to empty
        for priority, queue in self.queues.items():
            await queue.join()
        
        # Shutdown thread pool
        self.executor.shutdown(wait=True)
        
        logger.info("Deepfake detection service shut down successfully")

    def get_performance_metrics(self) -> Dict:
        """Get performance metrics for monitoring"""
        total_processed = len(self.processing_results)
        completed = sum(1 for r in self.processing_results.values() if r['status'] == 'completed')
        failed = sum(1 for r in self.processing_results.values() if r['status'] == 'failed')
        processing = sum(1 for r in self.processing_results.values() if r['status'] == 'processing')
        queued = sum(1 for r in self.processing_results.values() if r['status'] == 'queued')
        
        # Calculate average processing time for completed analyses
        completed_results = [r for r in self.processing_results.values() 
                           if r['status'] == 'completed' and 'processing_time' in r]
        avg_processing_time = np.mean([r['processing_time'] for r in completed_results]) if completed_results else 0
        
        return {
            'total_processed': total_processed,
            'completed': completed,
            'failed': failed,
            'processing': processing,
            'queued': queued,
            'queue_sizes': self.get_queue_status(),
            'avg_processing_time': avg_processing_time,
            'success_rate': (completed / max(total_processed, 1)) * 100
        }
