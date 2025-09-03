import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import Dict, Any

import uvicorn
from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import Counter, Histogram, generate_latest
import time

from config.settings import settings
from config.model_config import ModelConfig
from services.deepfake_service import DeepfakeService
from services.fraud_prediction_service import FraudPredictionService
from services.nlp_service import NLPService
from services.computer_vision_service import ComputerVisionService
from services.real_time_inference import RealTimeInferenceService
from api.deepfake_api import router as deepfake_router
from api.fraud_api import router as fraud_router
from api.document_api import router as document_router
from api.risk_api import router as risk_router
from utils.model_utils import ModelManager
from utils.data_validation import DataValidator

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Prometheus metrics
REQUEST_COUNT = Counter('satyashield_requests_total', 'Total requests', ['method', 'endpoint'])
REQUEST_DURATION = Histogram('satyashield_request_duration_seconds', 'Request duration')
PREDICTION_COUNT = Counter('satyashield_predictions_total', 'Total predictions', ['model_type'])
MODEL_LOAD_TIME = Histogram('satyashield_model_load_seconds', 'Model loading time')

class AIEngine:
    def __init__(self):
        self.deepfake_service = None
        self.fraud_service = None
        self.nlp_service = None
        self.cv_service = None
        self.realtime_service = None
        self.model_manager = None
        self.data_validator = None
        self.is_ready = False

    async def initialize_services(self):
        """Initialize all AI services"""
        try:
            logger.info("Initializing AI Engine services...")
            
            # Initialize model manager
            self.model_manager = ModelManager()
            await self.model_manager.load_all_models()
            
            # Initialize data validator
            self.data_validator = DataValidator()
            
            # Initialize services
            self.deepfake_service = DeepfakeService(self.model_manager)
            self.fraud_service = FraudPredictionService(self.model_manager)
            self.nlp_service = NLPService(self.model_manager)
            self.cv_service = ComputerVisionService(self.model_manager)
            self.realtime_service = RealTimeInferenceService(
                deepfake_service=self.deepfake_service,
                fraud_service=self.fraud_service,
                nlp_service=self.nlp_service,
                cv_service=self.cv_service
            )
            
            await self.realtime_service.start()
            
            self.is_ready = True
            logger.info("AI Engine services initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize AI Engine services: {e}")
            raise

    async def shutdown_services(self):
        """Shutdown all AI services"""
        try:
            logger.info("Shutting down AI Engine services...")
            
            if self.realtime_service:
                await self.realtime_service.stop()
            
            if self.model_manager:
                await self.model_manager.cleanup()
            
            logger.info("AI Engine services shut down successfully")
            
        except Exception as e:
            logger.error(f"Error during shutdown: {e}")

# Global AI engine instance
ai_engine = AIEngine()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await ai_engine.initialize_services()
    yield
    # Shutdown
    await ai_engine.shutdown_services()

# Create FastAPI app
app = FastAPI(
    title="SatyaShield AI Engine",
    description="AI-powered fraud detection and analysis engine for securities market",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(GZipMiddleware, minimum_size=1000)

# Middleware for metrics
@app.middleware("http")
async def add_process_time_header(request, call_next):
    start_time = time.time()
    
    # Count request
    REQUEST_COUNT.labels(
        method=request.method, 
        endpoint=request.url.path
    ).inc()
    
    response = await call_next(request)
    
    # Record duration
    process_time = time.time() - start_time
    REQUEST_DURATION.observe(process_time)
    response.headers["X-Process-Time"] = str(process_time)
    
    return response

# Health check endpoints
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy" if ai_engine.is_ready else "initializing",
        "timestamp": time.time(),
        "version": "1.0.0",
        "services": {
            "deepfake": ai_engine.deepfake_service is not None,
            "fraud_prediction": ai_engine.fraud_service is not None,
            "nlp": ai_engine.nlp_service is not None,
            "computer_vision": ai_engine.cv_service is not None,
            "realtime": ai_engine.realtime_service is not None
        }
    }

@app.get("/ready")
async def readiness_check():
    """Readiness check endpoint"""
    if not ai_engine.is_ready:
        raise HTTPException(status_code=503, detail="AI Engine not ready")
    return {"status": "ready", "timestamp": time.time()}

@app.get("/metrics")
async def get_metrics():
    """Prometheus metrics endpoint"""
    return generate_latest()

# Dependency to get AI services
async def get_ai_engine():
    if not ai_engine.is_ready:
        raise HTTPException(status_code=503, detail="AI Engine not ready")
    return ai_engine

# Include API routers
app.include_router(
    deepfake_router,
    prefix="/api/v1/deepfake",
    tags=["Deepfake Detection"],
    dependencies=[Depends(get_ai_engine)]
)

app.include_router(
    fraud_router,
    prefix="/api/v1/fraud",
    tags=["Fraud Detection"],
    dependencies=[Depends(get_ai_engine)]
)

app.include_router(
    document_router,
    prefix="/api/v1/document",
    tags=["Document Analysis"],
    dependencies=[Depends(get_ai_engine)]
)

app.include_router(
    risk_router,
    prefix="/api/v1/risk",
    tags=["Risk Assessment"],
    dependencies=[Depends(get_ai_engine)]
)

# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.status_code,
                "message": exc.detail,
                "timestamp": time.time()
            }
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": 500,
                "message": "Internal server error",
                "timestamp": time.time()
            }
        }
    )

# Root endpoint
@app.get("/")
async def root():
    return {
        "message": "SatyaShield AI Engine",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
        "metrics": "/metrics"
    }

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        workers=settings.WORKERS if not settings.DEBUG else 1,
        log_level="info"
    )
