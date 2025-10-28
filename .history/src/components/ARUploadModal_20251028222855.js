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

    // ⭐ NEW: State to manage file deletion
    const [filesToDelete, setFilesToDelete] = useState({
        image: false,
        model: false,
        video: false,
        audio: false,
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
            // ⭐ NEW: Reset delete flags when editing a new asset
            setFilesToDelete({
                image: false,
                model: false,
                video: false,
                audio: false,
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

    // ⭐ MODIFIED: handleFileChange to also uncheck delete if a new file is selected
    const handleFileChange = (e) => {
        const { name, files } = e.target;
        setFormData(p => ({ ...p, [name]: files[0] }));
        if (isEditMode) {
            const fileType = name.replace('File', ''); // 'image', 'model', 'video', 'audio'
            if (files[0]) {
                // If a new file is selected, unmark for deletion
                setFilesToDelete(p => ({ ...p, [fileType]: false }));
            }
        }
    };

    // ⭐ NEW: handleFileDeleteToggle for checkboxes
    const handleFileDeleteToggle = (fileType) => {
        setFilesToDelete(p => ({ ...p, [fileType]: !p[fileType] }));
        // If marking for deletion, clear the selected new file input
        setFormData(p => ({ ...p, [`${fileType}File`]: null })); // 'imageFile', 'modelFile', etc.
        // Special case for 'image' and 'model' which don't have 'File' suffix in formData
        if (fileType === 'image' || fileType === 'model') {
            setFormData(p => ({ ...p, [fileType]: null }));
        }
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
            };

            // ⭐ MODIFIED: Determine final URLs based on new uploads and delete flags
            finalData.imageUrl = filesToDelete.image ? null : (newImageUrl || oldFileUrls.image);
            finalData.modelUrl = filesToDelete.model ? null : (newModelUrl || oldFileUrls.model);
            finalData.videoUrl = filesToDelete.video ? null : (newVideoUrl || oldFileUrls.video);
            finalData.audioUrl = filesToDelete.audio ? null : (newAudioUrl || oldFileUrls.audio);


            setStatusMessage("Updating database records...");
            const selectedMarker = markers.find(m => m.name === formData.location);
            if (!selectedMarker) throw new Error("Selected location not found in markers list.");
            const markerRef = doc(db, "markers", String(selectedMarker.id));

            // ⭐ MODIFIED: Prepare update object to remove fields if value is null
            const updateArTargetData = { ...finalData };
            Object.keys(updateArTargetData).forEach(key => {
                if (updateArTargetData[key] === null) {
                    // Using `delete` on properties of an object to remove them from Firebase
                    updateArTargetData[key] = null; // Firebase will delete fields set to null in updateDoc
                }
            });


            if (formData.category === 'Building') {
                const targetRef = doc(db, "arTargets", formData.location);
                await setDoc(targetRef, updateArTargetData); // Use setDoc to create/overwrite
                await updateDoc(markerRef, {
                    arCameraSupported: true,
                    modelUrl: finalData.modelUrl // Update marker's modelUrl
                });
            } else if (formData.category === 'Relics/Artifacts') {
                const targetRef = isEditMode
                    ? doc(db, "arTargets", assetToEdit.id)
                    : doc(collection(db, "arTargets"));
                await setDoc(targetRef, updateArTargetData, { merge: true }); // Use setDoc with merge to update
                // ⭐ MODIFIED: Update marker's artifact list
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
                    artifactUpdate[`artifacts.${targetRef.id}`] = null; // Set to null to delete the field
                }
                await updateDoc(markerRef, artifactUpdate);
            }

            setStatusMessage("Cleaning up old files...");
            // ⭐ MODIFIED: Include old files for deletion if delete flag is true
            const filesToClean = [
                (newImageUrl && oldFileUrls.image) || (filesToDelete.image && oldFileUrls.image),
                (newModelUrl && oldFileUrls.model) || (filesToDelete.model && oldFileUrls.model),
                (newVideoUrl && oldFileUrls.video) || (filesToDelete.video && oldFileUrls.video),
                (newAudioUrl && oldFileUrls.audio) || (filesToDelete.audio && oldFileUrls.audio)
            ].filter(Boolean);

            if (filesToClean.length > 0) {
                await Promise.all(filesToClean.map(url => {
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

    // ⭐ NEW: renderFileInfo now includes a delete checkbox
    const renderFileInfo = (fileUrl, fileType, currentFilePropName) => fileUrl && (
        <div className="file-info">
            Current {fileType}: <a href={fileUrl} target="_blank" rel="noopener noreferrer">View File</a>
            {isEditMode && (
                <label className="delete-checkbox-label">
                    <input
                        type="checkbox"
                        checked={filesToDelete[currentFilePropName]}
                        onChange={() => handleFileDeleteToggle(currentFilePropName)}
                        disabled={isProcessing}
                    /> Delete
                </label>
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
                    {isEditMode && renderFileInfo(assetToEdit.imageUrl, "Image", "image")} {/* ⭐ MODIFIED: Pass 'image' for deletion */}
                    <input type="file" name="image" accept="image/jpeg,image/png" onChange={handleFileChange} required={!isEditMode && !assetToEdit?.imageUrl} disabled={isProcessing || filesToDelete.image} />
                </label>
                <label>3D Model File (.glb): {isEditMode && <span className="label-hint">(replace current)</span>}
                    {isEditMode && renderFileInfo(assetToEdit.modelUrl, "Model", "model")} {/* ⭐ MODIFIED: Pass 'model' for deletion */}
                    <input type="file" name="model" accept=".glb,.gltf" onChange={handleFileChange} required={!isEditMode && !assetToEdit?.modelUrl} disabled={isProcessing || filesToDelete.model} />
                </label>
                <label>Video File (optional): {isEditMode && <span className="label-hint">(replace current)</span>}
                    {isEditMode && assetToEdit.videoUrl && renderFileInfo(assetToEdit.videoUrl, "Video", "video")} {/* ⭐ MODIFIED: Pass 'video' for deletion */}
                    <input type="file" name="videoFile" accept="video/mp4" onChange={handleFileChange} disabled={isProcessing || filesToDelete.video} />
                </label>

                <label>Audio File (optional): {isEditMode && <span className="label-hint">(replace current)</span>}
                    {isEditMode && assetToEdit.audioUrl && renderFileInfo(assetToEdit.audioUrl, "Audio", "audio")} {/* ⭐ MODIFIED: Pass 'audio' for deletion */}
                    <input type="file" name="audioFile" accept="audio/mp3,audio/wav" onChange={handleFileChange} disabled={isProcessing || filesToDelete.audio} />
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