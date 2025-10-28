import React, { useRef, useState, useEffect } from 'react';
import './MarkerFormModal.css';
import OpeningHoursEditor from './OpeningHoursEditor';
import LocationPickerMap from './LocationPickerMap';
import { collection, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const MarkerFormModal = ({ onCancel, loading, form, setForm, isEditing }) => {
    const [activeTab, setActiveTab] = useState('details');
    const [previewImage, setPreviewImage] = useState('');
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [errors, setErrors] = useState({});

    const [popup, setPopup] = useState({ type: '', message: '' });

    const modalRef = useRef(null);

    useEffect(() => {
        if (isEditing && typeof form.image === 'string') {
            setPreviewImage(form.image);
        }
    }, [form.image, isEditing]);

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        const newValue = type === 'checkbox' ? checked : value;
        setForm((prev) => ({ ...prev, [name]: newValue }));
    };

    const handleImageChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setPreviewImage(URL.createObjectURL(file));
        setUploading(true);

        try {
            const uploadData = new FormData();
            uploadData.append('file', file);
            uploadData.append('upload_preset', 'Marker image');

            const res = await fetch('https://api.cloudinary.com/v1_1/dupjdmjha/image/upload', {
                method: 'POST',
                body: uploadData,
            });

            const data = await res.json();
            if (data.secure_url) {
                setForm((prev) => ({ ...prev, image: data.secure_url }));
            } else {
                alert('Upload failed.');
            }
        } catch (err) {
            console.error('Image upload error:', err);
            alert('Error uploading image.');
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async () => {
        const newErrors = {};

        if (!form.name) newErrors.name = 'Name is required.';
        if (!form.address) newErrors.address = 'Address is required.';
        if (!form.category) newErrors.category = 'Category is required.';
        if (!form.latitude || !form.longitude) {
            newErrors.address = 'Please pick a location on the map.';
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            setPopup({ type: 'error', message: 'Please fill all required fields.' });
            if (Object.keys(newErrors).length > 0) {
                setErrors(newErrors);
                setPopup({ type: 'error', message: 'Please fill all required fields.' });

                if (modalRef.current) {
                    modalRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                }
                return;
            }

            return;
        }

        setErrors({});
        setPopup({ type: '', message: '' });
        setSaving(true);

        try {
            const markerData = {
                ...form,
                id: form.id || Date.now(),
                categoryOption: form.category,
                customCategory: form.customCategory || '',
            };

            const docRef = isEditing
                ? doc(db, 'markers', markerData.id.toString())
                : doc(collection(db, 'markers'), markerData.id.toString());

            await setDoc(docRef, markerData);
            alert(isEditing ? 'Marker updated!' : 'Marker saved!');
            onCancel();
        } catch (err) {
            console.error('Saving error:', err);
            setPopup({ type: 'error', message: 'Failed to save marker. Please try again.' });
        } finally {
            setSaving(false);
        }
    };


    return (
        <div className="modal-overlay">
            <div className="modal-content" ref={modalRef}>

                <button className="modal-close" onClick={onCancel}>&times;</button>
                <h2>{isEditing ? 'Edit Marker' : 'Add New Marker'}</h2>
                {popup.message && (
                    <div className={`popup-message ${popup.type}`}>
                        {popup.message}
                    </div>
                )}

                <div className="tabs">
                    <button className={`tab ${activeTab === 'details' ? 'active' : ''}`} onClick={() => setActiveTab('details')}>Details</button>
                    <button className={`tab ${activeTab === 'hours' ? 'active' : ''}`} onClick={() => setActiveTab('hours')}>Opening Hours</button>
                </div>

                {activeTab === 'details' && (
                    <form className="marker-form">
                        <div className="field-group full-width">
                            <label htmlFor="name">Name*</label>
                            <input type="text" id="name" name="name" value={form.name} onChange={handleInputChange} required />
                        </div>
                        <div className="field-group full-width">
                            <label htmlFor="description">Description</label>
                            <textarea
                                id="description"
                                name="description"
                                value={form.description}
                                onChange={handleInputChange}
                                rows={4}
                                placeholder="Write a short description..."
                            />
                        </div>


                        <div className="marker-form full-width" style={{ gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

                            <div className="field-group">
                                <label htmlFor="image">Upload Image</label>
                                <input type="file" onChange={handleImageChange} accept="image/*" />
                            </div>

                            <div className="field-group">
                                <label htmlFor="imageUrl">Or Paste Image URL</label>
                                <input
                                    type="url"
                                    value={form.image}
                                    onChange={(e) => {
                                        setForm(prev => ({ ...prev, image: e.target.value }));
                                        setPreviewImage(e.target.value);
                                    }}
                                />
                            </div>

                            {previewImage && (
                                <div className="image-preview">
                                    <img src={previewImage} alt="Preview" />
                                </div>
                            )}
                        </div>

                        <div className="marker-form full-width" style={{ gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div className="field-group">
                                <label htmlFor="category">Category*</label>
                                <select id="category" name="category" value={form.category} onChange={handleInputChange} required>
                                    <option value="">Select Category</option>
                                    <option value="Historical">Historical</option>
                                    <option value="Food">Food</option>
                                    <option value="Museum">Museum</option>
                                    <option value="Park">Park</option>
                                    <option value="School">School</option>
                                    <option value="Government">Government Facilities</option>
                                </select>
                            </div>

                            <div className="field-group">
                                <label htmlFor="entranceFee">Entrance Fee</label>
                                <input
                                    type="text"
                                    id="entranceFee"
                                    name="entranceFee"
                                    value={form.entranceFee}
                                    onChange={handleInputChange}
                                    placeholder="e.g., 100 PHP or Free"
                                />
                            </div>
                        </div>
                        <div className="checkbox-row full-width">
                            <label className="checkbox-group">
                                <input type="checkbox" name="accessibleRestroom" checked={form.accessibleRestroom} onChange={handleInputChange} />
                                Accessible Restroom
                            </label>
                            <label className="checkbox-group">
                                <input type="checkbox" name="arCameraSupported" checked={form.arCameraSupported} onChange={handleInputChange} />
                                AR Supported
                            </label>
                        </div>
                        <div className="field-group full-width">
                            <label htmlFor="address">Address*</label>
                            <input type="text" id="address" name="address" value={form.address} onChange={handleInputChange} required />
                            <LocationPickerMap
                                onLocationSelect={({ lat, lng, address }) =>
                                    setForm((prev) => ({ ...prev, latitude: lat.toString(), longitude: lng.toString(), address }))
                                }
                            />
                        </div>


                    </form>
                )}

                {activeTab === 'hours' && (
                    <div className="field-group full-width">
                        <OpeningHoursEditor
                            value={form.openingHours}
                            onChange={(updatedHours) =>
                                setForm((prev) => ({ ...prev, openingHours: updatedHours || {} }))
                            }
                        />
                    </div>
                )}

                <div className="form-actions full-width">
                    {activeTab === 'details' && (
                        <button
                            type="button"
                            className="next-btn save-btn"
                            onClick={() => setActiveTab('hours')}
                        >
                            Next
                        </button>
                    )}
                    {activeTab === 'hours' && (
                        <button
                            type="button"
                            className="back-btn cancel-btn"
                            onClick={() => setActiveTab('details')}
                        >
                            Back
                        </button>
                    )}
                    <button
                        type="button"
                        className="save-btn"
                        onClick={handleSubmit}
                        disabled={saving || uploading}
                    >
                        {saving || uploading ? 'Saving...' : isEditing ? 'Update Marker' : 'Save Marker'}
                    </button>
                    <button
                        type="button"
                        className="cancel-btn"
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                </div>


            </div>
        </div>
    );
};

export default MarkerFormModal;
