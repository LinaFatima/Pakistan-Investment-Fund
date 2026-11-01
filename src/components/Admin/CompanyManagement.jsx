import React, { useState, useEffect } from 'react'
import { supabase } from '../../services/supabase'
import { adminPost } from '../../services/adminApi'

const CompanyManagement = ({ companies, onUpdate, fundType }) => {
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingCompany, setEditingCompany] = useState(null)
  const [formData, setFormData] = useState({
    company_name: '',
    symbol: '',
    weight_percentage: ''
  })
  const [localCompanies, setLocalCompanies] = useState([])

  // Fetch companies logic with dual sorting and filter out MZNPETF
  useEffect(() => {
    const fetchAllCompanies = async () => {
      try {
        const { data, error } = await supabase
          .from('all_companies_data')
          .select('*')
          .eq('fund_type', fundType)
          .order('is_active', { ascending: false })
          .order('weight_percentage', { ascending: false })

        if (error) throw error

        // Filter out Meezan Pakistan ETF (MZNPETF)
        const filteredData = (data || []).filter(company => company.symbol !== 'MZNPETF')
        setLocalCompanies(filteredData)
      } catch (error) {
        console.error('Error fetching companies:', error)
      }
    }

    fetchAllCompanies()
  }, [fundType, onUpdate])

  const handleAddCompany = async (e) => {
    e.preventDefault()
    try {
      await adminPost('/api/admin-companies', {
        action: 'add',
        company_name: formData.company_name,
        symbol: formData.symbol,
        weight_percentage: formData.weight_percentage,
        fund_type: fundType
      })

      setShowAddForm(false)
      setFormData({ company_name: '', symbol: '', weight_percentage: '' })
      onUpdate()
    } catch (error) {
      alert('Error adding company: ' + error.message)
    }
  }

  const handleEditCompany = async (e) => {
    e.preventDefault()
    try {
      await adminPost('/api/admin-companies', {
        action: 'update',
        id: editingCompany.id,
        company_name: formData.company_name,
        symbol: formData.symbol,
        weight_percentage: formData.weight_percentage
      })

      setEditingCompany(null)
      setFormData({ company_name: '', symbol: '', weight_percentage: '' })
      onUpdate()
    } catch (error) {
      alert('Error updating company: ' + error.message)
    }
  }

  const handleToggleStatus = async (companyId, currentStatus) => {
    try {
      await adminPost('/api/admin-companies', { action: 'toggle', id: companyId, is_active: !currentStatus })
      onUpdate()
    } catch (error) {
      alert('Error updating company status: ' + error.message)
    }
  }

  const handleDeleteCompany = async (companyId) => {
    if (!window.confirm('Are you sure you want to delete this company?')) return

    try {
      await adminPost('/api/admin-companies', { action: 'delete', id: companyId })
      onUpdate()
    } catch (error) {
      alert('Error deleting company: ' + error.message)
    }
  }

  const startEdit = (company) => {
    setEditingCompany(company)
    setFormData({
      company_name: company.company_name,
      symbol: company.symbol,
      weight_percentage: company.weight_percentage
    })
  }

  return (
    <div style={{ paddingRight: '10px' }}>
      {/* HEADER SECTION: Balanced spacing from top border */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        margin: '25px 0 20px 0'
      }}>
        <h2 style={{
          fontSize: '20px',
          fontWeight: '800',
          color: '#111827',
          margin: 0
        }}>
          Manage Companies
        </h2>
        <button
          className="btn-add"
          style={{ marginBottom: 0 }}
          onClick={() => setShowAddForm(true)}
        >
          + Add New Company
        </button>
      </div>

      {/* Add Company Form - FIXED BUTTON LAYOUT */}
      {showAddForm && (
        <div style={{ display: 'block', background: '#f8f9fa', padding: '20px', borderRadius: '10px', marginBottom: '30px' }}>
          <h3>Add New Company</h3>
          <form onSubmit={handleAddCompany}>
            <div className="form-group">
              <label>Company Name</label>
              <input
                type="text"
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Symbol (e.g., LUCK, HUBC)</label>
              <input
                type="text"
                value={formData.symbol}
                onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                required
                style={{ textTransform: 'uppercase' }}
              />
            </div>
            <div className="form-group">
              <label>Weight Percentage</label>
              <input
                type="number"
                step="0.01"
                value={formData.weight_percentage}
                onChange={(e) => setFormData({ ...formData, weight_percentage: e.target.value })}
                required
              />
            </div>

            {/* FIXED: Button container with proper spacing */}
            <div style={{
              display: 'flex',
              gap: '12px',
              flexWrap: 'wrap',
              marginTop: '20px'
            }}>
              <button
                type="submit"
                className="btn-primary"
                style={{
                  width: 'auto',
                  minWidth: '120px',
                  margin: 0
                }}
              >
                Add Company
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{
                  width: 'auto',
                  minWidth: '100px',
                  background: '#6c757d',
                  margin: 0
                }}
                onClick={() => setShowAddForm(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Modal - FIXED BUTTON LAYOUT */}
      {editingCompany && (
        <div style={{
          display: 'flex',
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0,0,0,0.5)',
          zIndex: 1000,
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            maxWidth: '500px',
            width: '100%',
            padding: '30px',
            borderRadius: '10px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <h3>Edit Company</h3>
            <form onSubmit={handleEditCompany}>
              <div className="form-group">
                <label>Company Name</label>
                <input
                  type="text"
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Symbol</label>
                <input
                  type="text"
                  value={formData.symbol}
                  onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Weight Percentage</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.weight_percentage}
                  onChange={(e) => setFormData({ ...formData, weight_percentage: e.target.value })}
                  required
                />
              </div>

              {/* FIXED: Button container with proper spacing */}
              <div style={{
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
                marginTop: '20px'
              }}>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{
                    width: 'auto',
                    minWidth: '100px',
                    margin: 0
                  }}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{
                    width: 'auto',
                    minWidth: '100px',
                    background: '#6c757d',
                    margin: 0
                  }}
                  onClick={() => setEditingCompany(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Companies Table */}
      <table className="admin-table">
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6ff' }}>
            <th className='admin-new'>S.No</th>
            <th className='admin-new'>Company Name</th>
            <th className='admin-new'>Symbol</th>
            <th className='admin-new'>Weight %</th>
            <th className='admin-new'>Status</th>
          </tr>
        </thead>
        <tbody>
          {localCompanies.map((company, index) => (
            <tr key={company.id}>
              <td>{index + 1}</td>
              <td>{company.company_name}</td>
              <td><strong>{company.symbol}</strong></td>
              <td>{company.weight_percentage}%</td>
              <td>
                {company.is_active ? (
                  <span style={{ color: '#28a745', fontWeight: 'bold' }}>Active</span>
                ) : (
                  <span style={{ color: '#dc3545', fontWeight: 'bold' }}>Inactive</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default CompanyManagement