import React, { useState, useEffect, useMemo } from "react";
import { doc, setDoc, updateDoc, collection } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../firebase";
import "./ARUploadModal.css";

const ARUploadModal = ({ markers, arAssets, assetToEdit, onClose }) => {
    const isEditMode = Boolean(assetToEdit);

    const [formData, setFormData] = useState({
        location: "",
        category: "Building",
        name: "",
        description: "",
        image: null,
        model: null,
        videoFile: null,
        audioFile: null,
        physicalWidth: 0.15,
    });

    // ⭐ NEW: State to hold current file URLs in the component for easy deletion/reference
    const [currentFileUrls, setCurrentFileUrls] = useState({
        imageUrl: null,
        modelUrl: null,
        videoUrl: null,
        audioUrl: null,
    });

    const [isProcessing, setIsProcessing] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [statusMessage, setStatusMessage] = useState("");

    useEffect(() => {
        if (isEditMode) {
            setFormData({
                location: assetToEdit.locationName || "",
                category: assetToEdit.category || "Building",
                name: assetToEdit.name || "",
                description: assetToEdit.description || "",
                physicalWidth: assetToEdit.physicalWidth || 0.15,
                image: null, model: null, videoFile: null, audioFile: null,
            });
            // ⭐ NEW: Initialize current file URLs from assetToEdit
            setCurrentFileUrls({
                imageUrl: assetToEdit.imageUrl || null,
                modelUrl: assetToEdit.modelUrl || null,
                videoUrl: assetToEdit.videoUrl || null,
                audioUrl: assetToEdit.audioUrl || null,
            });
        }
    }, [assetToEdit, isEditMode]);

    const availableMarkers = useMemo(() => {
        let filteredMarkers = markers;

        if (!isEditMode) {
            if (formData.category === 'Building') {
                const locationsWithBuildings = arAssets
                    .filter(asset => asset.category === 'Building')
                    .map(asset => asset.locationName);
                filteredMarkers = markers.filter(marker => !locationsWithBuildings.includes(marker.name));
            }
        }

        return filteredMarkers.sort((a, b) => a.name.localeCompare(b.name));

    }, [markers, arAssets, isEditMode, formData.category]);

    const handleInputChange = (e) => setFormData(p => ({ ...p, [e.target.name]: e.target.value }));

    // ⭐ MODIFIED: handleFileChange to clear the current file URL if a new one is selected
    const handleFileChange = (e) => {
        const { name, files } = e.target;
        setFormData(p => ({ ...p, [name]: files[0] }));

        // When a new file is chosen, we temporarily clear the old URL from currentFileUrls
        // to prevent it from being used in finalData unless explicitly uploaded.
        // The old URL is still available in assetToEdit for the cleanup step.
        const urlKey = name.replace('File', '') + 'Url'; // image, model, videoUrl, audioUrl
        setCurrentFileUrls(p => ({ ...p, [urlKey]: null }));
    };

    // ⭐ NEW: handleFileDelete function
    const handleFileDelete = (fileUrlKey, fileInputName) => {
        if (!window.confirm(`Are you sure you want to delete the current ${fileUrlKey.replace('Url', '')} file? This action is permanent and will be saved when you click "Save Changes".`)) {
            return;
        }

        // 1. Clear the URL from the component's tracking state (currentFileUrls)
        setCurrentFileUrls(p => ({ ...p, [fileUrlKey]: null }));

        // 2. Clear the file from the formData state (in case a new one was selected and then deleted)
        setFormData(p => ({ ...p, [fileInputName]: null }));

        // 3. Clear the file input element itself (to reset the form visually)
        const input = document.getElementsByName(fileInputName)[0];
        if (input) input.value = '';
    };

    const uploadToFirebaseStorage = (file, path) => {
        return new Promise((resolve, reject) => {
            if (!file) { resolve(null); return; }
            const storageRef = ref(storage, `${path}/${Date.now()}_${file.name}`);
            const uploadTask = uploadBytesResumable(storageRef, file);
            uploadTask.on('state_changed',
                (snapshot) => setUploadProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
                (error) => reject(error),
                () => getDownloadURL(uploadTask.snapshot.ref).then(resolve)
            );
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.location) { alert("Please select a location."); return; }
        if (!formData.name.trim()) { alert("Please enter a name."); return; }
        setIsProcessing(true);
        setUploadProgress(0);
        setStatusMessage("Starting operation...");

        const oldFileUrls = {
            image: isEditMode ? assetToEdit.imageUrl : null,
            model: isEditMode ? assetToEdit.modelUrl : null,
            video: isEditMode ? assetToEdit.videoUrl : null,
            audio: isEditMode ? assetToEdit.audioUrl : null,
        };

        try {
            setStatusMessage("Uploading new files...");
            const [newImageUrl, newModelUrl, newVideoUrl, newAudioUrl] = await Promise.all([
                uploadToFirebaseStorage(formData.image, 'models/markers'),
                uploadToFirebaseStorage(formData.model, 'models/models'),
                uploadToFirebaseStorage(formData.videoFile, 'models/video'),
                uploadToFirebaseStorage(formData.audioFile, 'models/audio')
            ]);

            setUploadProgress(100);

            const finalData = {
                category: formData.category,
                name: formData.name,
                description: formData.description,
                locationName: formData.location,
                physicalWidth: Number(formData.physicalWidth),

                // ⭐ MODIFIED: Check for new upload first, then currentFileUrls state
                // If a file was deleted (currentFileUrls[key] is null), the key will be null.
                imageUrl: newImageUrl || currentFileUrls.imageUrl,
                modelUrl: newModelUrl || currentFileUrls.modelUrl,
                videoUrl: newVideoUrl || currentFileUrls.videoUrl,
                audioUrl: newAudioUrl || currentFileUrls.audioUrl,
            };

            setStatusMessage("Updating database records...");
            const selectedMarker = markers.find(m => m.name === formData.location);
            if (!selectedMarker) throw new Error("Selected location not found in markers list.");
            const markerRef = doc(db, "markers", String(selectedMarker.id));

            // Prepare update object to remove fields if value is null
            const updateArTargetData = { ...finalData };
            // Ensure any null values delete the field in Firestore upon update
            Object.keys(updateArTargetData).forEach(key => {
                if (updateArTargetData[key] === null) {
                    updateArTargetData[key] = null;
                }
            });


            if (formData.category === 'Building') {
                const targetRef = doc(db, "arTargets", formData.location);
                await setDoc(targetRef, updateArTargetData);
                await updateDoc(markerRef, {
                    arCameraSupported: true,
                    modelUrl: finalData.modelUrl
                });
            } else if (formData.category === 'Relics/Artifacts') {
                const targetRef = isEditMode
                    ? doc(db, "arTargets", assetToEdit.id)
                    : doc(collection(db, "arTargets"));
                await setDoc(targetRef, updateArTargetData, { merge: true });

                const artifactUpdate = {
                    arCameraSupported: true,
                };
                if (finalData.modelUrl) {
                    artifactUpdate[`artifacts.${targetRef.id}`] = {
                        name: finalData.name,
                        modelUrl: finalData.modelUrl,
                    };
                } else {
                    // If model is deleted, also remove it from marker's artifacts
                    artifactUpdate[`artifacts.${targetRef.id}`] = null;
                }
                await updateDoc(markerRef, artifactUpdate);
            }

            setStatusMessage("Cleaning up old files...");
            // ⭐ MODIFIED: Clean up old file if a NEW file was uploaded OR if the URL was deleted
            const filesToClean = [
                (newImageUrl && oldFileUrls.image),
                (newModelUrl && oldFileUrls.model),
                (newVideoUrl && oldFileUrls.video),
                (newAudioUrl && oldFileUrls.audio)
            ];

            // Add files deleted via the button to the cleanup list
            if (isEditMode) {
                if (assetToEdit.imageUrl && finalData.imageUrl === null) filesToClean.push(assetToEdit.imageUrl);
                if (assetToEdit.modelUrl && finalData.modelUrl === null) filesToClean.push(assetToEdit.modelUrl);
                if (assetToEdit.videoUrl && finalData.videoUrl === null) filesToClean.push(assetToEdit.videoUrl);
                if (assetToEdit.audioUrl && finalData.audioUrl === null) filesToClean.push(assetToEdit.audioUrl);
            }

            const uniqueFilesToClean = filesToClean.filter(Boolean);


            if (uniqueFilesToClean.length > 0) {
                await Promise.all(uniqueFilesToClean.map(url => {
                    console.log("Deleting old file from storage:", url);
                    return deleteObject(ref(storage, url));
                }));
            }

            alert(`AR Asset ${isEditMode ? 'updated' : 'uploaded'} successfully!`);
            onClose();
        } catch (error) {
            console.error("Operation failed:", error);
            alert(`Operation failed: ${error.message}.`);
        } finally {
            setIsProcessing(false);
        }
    };

    // ⭐ MODIFIED: renderFileInfo to include a delete button
    const renderFileInfo = (fileUrl, fileType, fileUrlKey, fileInputName) => fileUrl && (
        <div className="file-info-container">
            <div className="file-info">
                Current {fileType}: <a href={fileUrl} target="_blank" rel="noopener noreferrer">View File</a>
            </div>
            {isEditMode && (
                <button
                    type="button"
                    className="delete-file-btn"
                    onClick={() => handleFileDelete(fileUrlKey, fileInputName)}
                    disabled={isProcessing}
                >
                    Delete File
                </button>
            )}
        </div>
    );

    return (
        <div className="upload-modal" onClick={(e) => e.target.classList.contains("upload-modal") && onClose()}>
            <form className="upload-form" onSubmit={handleSubmit}>
                <h2>{isEditMode ? 'Edit AR Asset' : 'Upload New AR Asset'}</h2>
                <label>Category:
                    <select name="category" value={formData.category} onChange={handleInputChange} required disabled={isProcessing}>
                        <option value="Building">Building</option>
                        <option value="Relics/Artifacts">Relics/Artifacts</option>
                    </select>
                </label>
                <label>Location:
                    <select name="location" value={formData.location} onChange={handleInputChange} required disabled={isProcessing || isEditMode}>
                        <option value="">Select Location</option>
                        {availableMarkers.map(m => (<option key={m.id} value={m.name}>{m.name}</option>))}
                    </select>
                </label>
                <label>Name:
                    <input type="text" name="name" value={formData.name} onChange={handleInputChange} placeholder="e.g., Baluarte de San Diego" required disabled={isProcessing} />
                </label>
                <label>Description:
                    <textarea name="description" value={formData.description} onChange={handleInputChange} placeholder="Enter a brief history or description..." required disabled={isProcessing}></textarea>
                </label>
                <label>Target Image: {isEditMode && <span className="label-hint">(replace current)</span>}
                    {isEditMode && currentFileUrls.imageUrl && renderFileInfo(currentFileUrls.imageUrl, "Image", "imageUrl", "image")}
                    <input type="file" name="image" accept="image/jpeg,image/png" onChange={handleFileChange} required={!isEditMode && !currentFileUrls.imageUrl} disabled={isProcessing} />
                </label>
                <label>3D Model File (.glb): {isEditMode && <span className="label-hint">(replace current)</span>}
                    {isEditMode && currentFileUrls.modelUrl && renderFileInfo(currentFileUrls.modelUrl, "Model", "modelUrl", "model")}
                    <input type="file" name="model" accept=".glb,.gltf" onChange={handleFileChange} required={!isEditMode && !currentFileUrls.modelUrl} disabled={isProcessing} />
                </label>
                <label>Video File (optional): {isEditMode && <span className="label-hint">(replace current)</span>}
                    {isEditMode && currentFileUrls.videoUrl && renderFileInfo(currentFileUrls.videoUrl, "Video", "videoUrl", "videoFile")}
                    <input type="file" name="videoFile" accept="video/mp4" onChange={handleFileChange} disabled={isProcessing} />
                </label>

                <label>Audio File (optional): {isEditMode && <span className="label-hint">(replace current)</span>}
                    {isEditMode && currentFileUrls.audioUrl && renderFileInfo(currentFileUrls.audioUrl, "Audio", "audioUrl", "audioFile")}
                    <input type="file" name="audioFile" accept="audio/mp3,audio/wav" onChange={handleFileChange} disabled={isProcessing} />
                </label>

                <label>Target's Physical Width (meters):
                    <input type="number" name="physicalWidth" value={formData.physicalWidth} onChange={handleInputChange} step="0.01" required disabled={isProcessing} />
                </label>
                {isProcessing && (
                    <div className="upload-status">
                        <p>{statusMessage} {statusMessage.includes("Uploading") && `${Math.round(uploadProgress)}%`}</p>
                        <div className="progress-bar-container"><div className="progress-bar" style={{ width: `${uploadProgress}%` }}></div></div>
                    </div>
                )}
                <div className="arform-actions">
                    <button type="submit" disabled={isProcessing}>{isProcessing ? 'Processing...' : (isEditMode ? 'Save Changes' : 'Submit')}</button>
                    <button type="button" onClick={onClose} disabled={isProcessing}>Cancel</button>
                </div>
            </form>
        </div>
    );
};

export default ARUploadModal;