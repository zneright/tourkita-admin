import React, { useState, useEffect, useCallback, useMemo } from "react";
import "./ARManagement.css";
import "@google/model-viewer";
// MODIFIED: Added FiSearch for the new search bar
import { FiLoader, FiEye, FiEyeOff, FiSearch } from "react-icons/fi";
import Sidebar from "../components/Sidebar";
import { collection, getDocs, query, orderBy, doc, deleteDoc, updateDoc, where } from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import { db, storage } from "../firebase";
import ARUploadModal from "../components/ARUploadModal";
import ARPreviewModal from "../components/ARPreviewModal";

const SkeletonARCard = () => (
    <div className="marker-card skeleton-card">
        <div className="skeleton skeleton-image"></div>
        <div className="marker-card-content">
            <div className="skeleton skeleton-title"></div>
            <div className="skeleton skeleton-text"></div>
        </div>
        <div className="card-actions">
            <div className="skeleton skeleton-button"></div>
            <div className="skeleton skeleton-button"></div>
        </div>
    </div>
);

const SkeletonARList = ({ count = 8 }) => (
    <>
        {Array.from({ length: count }).map((_, index) => (
            <SkeletonARCard key={index} />
        ))}
    </>
);

const ArManagement = () => {
    const [showUploadForm, setShowUploadForm] = useState(false);
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [assetToEdit, setAssetToEdit] = useState(null);
    const [assetToPreview, setAssetToPreview] = useState(null);
    const [markers, setMarkers] = useState([]);
    const [arAssets, setArAssets] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [deletingId, setDeletingId] = useState(null);
    const [updatingVisibilityId, setUpdatingVisibilityId] = useState(null);
    const [activeCategory, setActiveCategory] = useState("All");
    // ADDED: State for the search term
    const [searchTerm, setSearchTerm] = useState("");

    const fetchMarkers = useCallback(async () => {
        try {
            const snapshot = await getDocs(collection(db, "markers"));
            const markersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setMarkers(markersData);
        } catch (error) { console.error("Error fetching markers:", error); }
    }, []);

    const fetchArAssets = useCallback(async () => {
        try {
            const assetsQuery = query(collection(db, "arTargets"), orderBy("__name__"));
            const snapshot = await getDocs(assetsQuery);
            const assetsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setArAssets(assetsData);
        } catch (error) { console.error("Error fetching AR assets:", error); }
        finally { setIsLoading(false); }
    }, []);

    useEffect(() => {
        setIsLoading(true);
        fetchMarkers();
        fetchArAssets();
    }, [fetchMarkers, fetchArAssets]);

    // MODIFIED: Updated filtering logic to include search functionality
    const filteredAssets = useMemo(() => {
        // 1. Filter by category/visibility first
        let assetsToShow;
        const visibleAssets = arAssets.filter(asset => asset.isVisible !== false);
        const hiddenAssets = arAssets.filter(asset => asset.isVisible === false);

        switch (activeCategory) {
            case "Hidden":
                assetsToShow = hiddenAssets;
                break;
            case "All":
                assetsToShow = visibleAssets;
                break;
            default:
                assetsToShow = visibleAssets.filter(asset => asset.category === activeCategory);
                break;
        }

        // 2. If no search term, return the already filtered list
        if (!searchTerm.trim()) {
            return assetsToShow;
        }

        // 3. Otherwise, apply the search filter on top
        const lowercasedFilter = searchTerm.toLowerCase();
        return assetsToShow.filter(asset => {
            const nameMatch = asset.name?.toLowerCase().includes(lowercasedFilter);
            const locationMatch = asset.locationName?.toLowerCase().includes(lowercasedFilter);
            return nameMatch || locationMatch;
        });
    }, [arAssets, activeCategory, searchTerm]); // Added searchTerm to dependency array

    const handleModalClose = () => {
        setShowUploadForm(false);
        setAssetToEdit(null);
        fetchArAssets();
    };

    const handleEditClick = (e, asset) => {
        e.stopPropagation();
        setAssetToEdit(asset);
        setShowUploadForm(true);
    };

    const handlePreviewClick = (asset) => {
        if (asset.isVisible !== false) {
            setAssetToPreview(asset);
            setShowPreviewModal(true);
        }
    };

    const handleToggleVisibility = async (e, asset) => {
        e.stopPropagation();
        setUpdatingVisibilityId(asset.id);
        const newVisibility = asset.isVisible === false;

        try {
            const assetRef = doc(db, "arTargets", asset.id);
            await updateDoc(assetRef, { isVisible: newVisibility });
            setArAssets(prevAssets =>
                prevAssets.map(a =>
                    a.id === asset.id ? { ...a, isVisible: newVisibility } : a
                )
            );
        } catch (error) {
            console.error("Error updating visibility:", error);
            alert("Failed to update visibility. Please try again.");
        } finally {
            setUpdatingVisibilityId(null);
        }
    };

    const handleDeleteClick = async (e, asset) => {
        e.stopPropagation();
        if (!window.confirm(`Are you sure you want to delete the AR asset "${asset.name || asset.id}"? This cannot be undone.`)) {
            return;
        }
        setDeletingId(asset.id);
        try {
            const locationName = asset.locationName || asset.id;
            await deleteDoc(doc(db, "arTargets", asset.id));
            const filesToDelete = [asset.imageUrl, asset.modelUrl, asset.videoUrl].filter(Boolean);
            if (filesToDelete.length > 0) {
                const deletePromises = filesToDelete.map(url => deleteObject(ref(storage, url)));
                await Promise.all(deletePromises);
            }
            const q = query(collection(db, "arTargets"), where("locationName", "==", locationName));
            const remainingAssetsSnapshot = await getDocs(q);
            if (remainingAssetsSnapshot.empty) {
                const markerToUpdate = markers.find(m => m.name === locationName);
                if (markerToUpdate) {
                    const markerRef = doc(db, "markers", String(markerToUpdate.id));
                    await updateDoc(markerRef, { arCameraSupported: false });
                }
                await deleteDoc(doc(db, "arMarkers", locationName));
            }
            alert("AR Asset deleted successfully!");
            fetchArAssets();
        } catch (error) {
            console.error("Error during deletion process:", error);
            alert(`An error occurred: ${error.message}.`);
        } finally {
            setDeletingId(null);
        }
    };

    // ADDED: A helper variable to improve the empty state message
    const isSearchActive = searchTerm.trim().length > 0;

    return (
        <div className={showUploadForm ? "dashboard-main modal-is-open" : "dashboard-main"}>
            <div className="dashboard-section">
                <Sidebar />
                <div className="page-header">
                    <h2 className="page-title">AR Asset Management</h2>
                    <p className="page-subtitle">Manage 3D models and content for locations in Intramuros.</p>
                </div>
                {/* MODIFIED: The top controls section is updated for the search bar */}
                <div className="top-controls">
                    <div className="mtab-buttons">
                        <button className={`mtab ${activeCategory === "All" ? "active" : ""}`} onClick={() => setActiveCategory("All")}>All</button>
                        <button className={`mtab ${activeCategory === "Building" ? "active" : ""}`} onClick={() => setActiveCategory("Building")}>Buildings</button>
                        <button className={`mtab ${activeCategory === "Relics/Artifacts" ? "active" : ""}`} onClick={() => setActiveCategory("Relics/Artifacts")}>Relics/Artifacts</button>
                        <button className={`mtab ${activeCategory === "Hidden" ? "active" : ""}`} onClick={() => setActiveCategory("Hidden")}>Hidden</button>
                    </div>
                    <div className="search-and-add">
                        <div className="search-bar">
                            <FiSearch className="search-icon" />
                            <input
                                type="text"
                                placeholder="Search by name or location..."
                                className="search-input"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <button onClick={() => { setAssetToEdit(null); setShowUploadForm(true); }}>Add New AR Asset</button>
                    </div>
                </div>
                <div className="markers-list">
                    {isLoading ? (
                        <SkeletonARList count={8} />
                    ) : (
                        filteredAssets.map((asset) => (
                            <div
                                className={`marker-card ${asset.isVisible === false ? 'is-hidden' : ''}`}
                                key={asset.id}
                                onClick={() => deletingId !== asset.id && handlePreviewClick(asset)}
                            >
                                {(deletingId === asset.id || updatingVisibilityId === asset.id) && (
                                    <div className="card-loading-overlay"><FiLoader className="spinner" /></div>
                                )}
                                <div className="marker-card-image">
                                    {asset.modelUrl ? (
                                        <model-viewer src={asset.modelUrl} alt={`3D model for ${asset.name}`} auto-rotate camera-controls disable-zoom style={{ width: '100%', height: '160px', backgroundColor: '#f0f0f0' }}></model-viewer>
                                    ) : (
                                        <img src={asset.imageUrl || 'https://via.placeholder.com/300x160?text=No+Image'} alt={asset.name} onError={(el) => { el.target.onerror = null; el.target.src = 'https://via.placeholder.com/300x160?text=No+Image'; }} />
                                    )}
                                </div>
                                <div className="marker-card-content">
                                    <h4>{asset.name || asset.id}</h4>
                                    <p className="asset-category">{asset.category}</p>
                                </div>
                                <div className="card-actions">
                                    <button
                                        onClick={(ev) => handleToggleVisibility(ev, asset)}
                                        className="visibility-btn"
                                        disabled={deletingId === asset.id || updatingVisibilityId === asset.id}
                                    >
                                        {asset.isVisible === false ? <FiEye /> : <FiEyeOff />}
                                        {asset.isVisible === false ? 'Show' : 'Hide'}
                                    </button>
                                    <button onClick={(ev) => handleEditClick(ev, asset)} className="edit-btn" disabled={deletingId === asset.id || updatingVisibilityId === asset.id}>Edit</button>
                                    <button onClick={(ev) => handleDeleteClick(ev, asset)} className="delete-btn" disabled={deletingId === asset.id || updatingVisibilityId === asset.id}>Delete</button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* MODIFIED: Updated empty state to be search-aware */}
                {!isLoading && filteredAssets.length === 0 && (
                    <div className="empty-state">
                        {isSearchActive ? (
                            <>
                                <h3>No Results Found</h3>
                                <p>Your search for "{searchTerm}" did not match any assets.</p>
                            </>
                        ) : (
                            <>
                                <h3>No AR Assets Found for '{activeCategory}'</h3>
                                <p>Click "Add New AR Asset" to get started or select a different category.</p>
                            </>
                        )}
                    </div>
                )}

                {showUploadForm && <ARUploadModal markers={markers} arAssets={arAssets} assetToEdit={assetToEdit} onClose={handleModalClose} />}
                {showPreviewModal && <ARPreviewModal asset={assetToPreview} onClose={() => setShowPreviewModal(false)} />}
            </div>
        </div>
    );
};

export default ArManagement;